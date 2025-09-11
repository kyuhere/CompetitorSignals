
interface RedditPost {
  title: string;
  subreddit: string;
  permalink: string;
  num_comments: number;
  url?: string;
}

interface RedditComment {
  body: string;
  score?: number;
}

interface PostAnalysis {
  title: string;
  subreddit: string;
  comments: number;
  summary: string;
  url?: string;
  permalink: string;
  quotes?: string[];
}

interface RedditSentimentResult {
  query: string;
  posts: PostAnalysis[];
  overallSentiment: string;
}

class RedditSentimentService {
  private readonly HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  };

  // Focus on the specific subreddits you mentioned
  private readonly TARGET_SUBREDDITS = ['news', 'business', 'technology'];

  async searchRedditPosts(query: string, limit: number = 10): Promise<RedditPost[]> {
    const allPosts: RedditPost[] = [];
    
    // Search across all target subreddits
    for (const subreddit of this.TARGET_SUBREDDITS) {
      try {
        console.log(`Searching r/${subreddit} for: ${query}`);
        
        // Use old.reddit.com for potentially better rate limits
        const searchUrl = `https://old.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&type=link&sort=hot&limit=${Math.ceil(limit / this.TARGET_SUBREDDITS.length)}`;
        
        console.log(`Reddit search URL: ${searchUrl}`);
        
        const response = await fetch(searchUrl, {
          headers: this.HEADERS
        });

        if (!response.ok) {
          console.error(`Reddit search failed for r/${subreddit}: ${response.status} ${response.statusText}`);
          continue; // Skip this subreddit and try the next one
        }

        const data = await response.json();
        console.log(`Reddit API returned ${data?.data?.children?.length || 0} posts from r/${subreddit}`);
        
        if (!data?.data?.children) {
          console.log(`No children found in Reddit response for r/${subreddit}`);
          continue;
        }

        // Process posts from this subreddit
        for (const child of data.data.children) {
          const postData = child.data;
          
          // Skip if it's a promoted post or doesn't have meaningful content
          if (postData.stickied || postData.distinguished === 'admin-distinguished') {
            continue;
          }
          
          allPosts.push({
            title: postData.title,
            subreddit: postData.subreddit,
            permalink: postData.permalink,
            num_comments: postData.num_comments,
            url: postData.url
          });
          
          console.log(`Found post: ${postData.title.substring(0, 50)}... in r/${postData.subreddit} with ${postData.num_comments} comments`);
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error searching r/${subreddit}:`, error);
        continue; // Continue with other subreddits
      }
    }

    // Sort by comment count and return top posts
    const sortedPosts = allPosts
      .filter(post => post.num_comments > 2) // Only posts with meaningful discussion
      .sort((a, b) => b.num_comments - a.num_comments)
      .slice(0, limit);

    console.log(`Found ${sortedPosts.length} total posts across all subreddits`);
    return sortedPosts;
  }

  async fetchComments(permalink: string, limit: number = 20): Promise<string[]> {
    try {
      // Use old.reddit.com for potentially better rate limits
      const commentsUrl = `https://old.reddit.com${permalink}.json`;
      
      console.log(`Fetching comments from: ${commentsUrl}`);
      
      const response = await fetch(commentsUrl, {
        headers: this.HEADERS
      });

      if (!response.ok) {
        console.error(`Reddit comments fetch failed: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const comments: string[] = [];

      // The Reddit API returns an array where the second element contains the comments
      if (Array.isArray(data) && data.length > 1 && data[1].data && data[1].data.children) {
        for (const comment of data[1].data.children) {
          const commentData = comment.data;
          const body = commentData.body;
          
          // Skip deleted, removed, bot comments, or very short comments
          if (body && 
              body !== '[deleted]' && 
              body !== '[removed]' && 
              body !== '[comment removed by moderator]' &&
              !body.startsWith('I am a bot') &&
              body.length > 20 && // Longer minimum for more meaningful content
              !commentData.stickied) {
            comments.push(body);
            
            if (comments.length >= limit) {
              break;
            }
          }
        }
      }

      console.log(`Extracted ${comments.length} meaningful comments`);
      return comments;
    } catch (error) {
      console.error('Error fetching Reddit comments:', error);
      return [];
    }
  }

  async analyzeSentiment(comments: string[], query: string, postTitle: string): Promise<{ summary: string; quotes: string[] }> {
    if (!comments.length) {
      return { summary: "No meaningful comments found for analysis.", quotes: [] };
    }

    // Limit comments for token efficiency but prioritize longer, more substantive ones
    const qualityComments = comments
      .filter(c => c.length > 30 && c.length < 500) // Good balance of substance vs readability
      .slice(0, 12);
    
    const commentsText = qualityComments.map((c, i) => `Comment ${i + 1}: ${c}`).join('\n\n');

    const prompt = `
You are a social media sentiment analyst. Analyze Reddit public opinion about "${query}" based on these comments from the post titled "${postTitle}".

Comments to analyze:
${commentsText}

Please provide a comprehensive sentiment analysis including:
1. Overall sentiment (positive, negative, neutral, or mixed) with reasoning
2. Key recurring themes and concerns mentioned
3. Notable opinions, trends, or insights
4. Public perception and any potential business implications

Return your response in JSON format:
{
  "summary": "Detailed analysis of public sentiment and key themes (2-3 sentences)",
  "quotes": ["most representative quote 1", "most representative quote 2", "most representative quote 3"]
}

Select the 3 most representative quotes that best capture the overall sentiment and key points.
`;

    try {
      // Direct OpenAI call for Reddit sentiment analysis
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR 
      });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 400
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { 
          summary: `Found ${comments.length} comments discussing ${query} but unable to analyze sentiment.`, 
          quotes: [] 
        };
      }
      
      try {
        const parsed = JSON.parse(content);
        return {
          summary: parsed.summary || content,
          quotes: parsed.quotes || []
        };
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        return { summary: content, quotes: [] };
      }
    } catch (error) {
      console.error('Error analyzing sentiment with OpenAI:', error);
      return { 
        summary: `Found ${comments.length} comments discussing ${query}. Manual review recommended due to analysis error.`, 
        quotes: [] 
      };
    }
  }

  async getRedditSentiment(query: string): Promise<RedditSentimentResult> {
    console.log(`Starting Reddit sentiment analysis for: ${query}`);

    // Extract company name if query is a URL
    const searchQuery = this.extractCompanyFromUrl(query);
    console.log(`Search query after URL extraction: ${searchQuery}`);
    
    // Search for posts across target subreddits
    const posts = await this.searchRedditPosts(searchQuery, 8);
    console.log(`Found ${posts.length} posts for analysis`);
    
    if (posts.length === 0) {
      console.log('No posts found, returning empty result');
      return {
        query: searchQuery,
        posts: [],
        overallSentiment: `No recent Reddit discussions found about ${searchQuery} in r/news, r/business, or r/technology.`
      };
    }

    const analyses: PostAnalysis[] = [];

    // Analyze each post's comments
    for (const post of posts) {
      console.log(`Analyzing post: ${post.title.substring(0, 50)}... from r/${post.subreddit}`);
      
      const comments = await this.fetchComments(post.permalink, 25);
      console.log(`Fetched ${comments.length} comments for analysis`);
      
      if (comments.length > 0) {
        const analysis = await this.analyzeSentiment(comments, searchQuery, post.title);

        analyses.push({
          title: post.title,
          subreddit: post.subreddit,
          comments: post.num_comments,
          summary: analysis.summary,
          url: post.url,
          permalink: post.permalink,
          quotes: analysis.quotes
        });
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log(`Completed analysis of ${analyses.length} posts with comments`);

    // Generate overall sentiment summary
    const overallSentiment = await this.generateOverallSentiment(analyses, searchQuery);

    const result = {
      query: searchQuery,
      posts: analyses,
      overallSentiment
    };

    console.log(`Reddit sentiment analysis completed for ${searchQuery}:`, {
      postsAnalyzed: result.posts.length,
      subredditsSearched: this.TARGET_SUBREDDITS.join(', ')
    });

    return result;
  }

  private extractCompanyFromUrl(input: string): string {
    // If it's a URL, try to extract company name
    if (input.includes('http') || input.includes('.com') || input.includes('.org')) {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?([^\/\.]+)/);
      if (urlMatch) {
        const domain = urlMatch[1];
        // Extract company name from domain (e.g., "openai.com" -> "openai")
        return domain.toLowerCase();
      }
    }
    
    return input.toLowerCase(); // Return as-is if not a URL, converted to lowercase for better search
  }

  private async generateOverallSentiment(analyses: PostAnalysis[], query: string): Promise<string> {
    if (!analyses.length) {
      return `No recent Reddit discussions with meaningful comments found about ${query} in business, technology, or news subreddits.`;
    }

    const summariesText = analyses.map((analysis, index) => 
      `r/${analysis.subreddit} (${analysis.comments} comments): ${analysis.summary}`
    ).join('\n\n');

    const prompt = `
Based on these Reddit sentiment analyses about "${query}" from r/news, r/business, and r/technology, provide an overall public sentiment summary:

${summariesText}

Provide a concise summary including:
1. Overall sentiment breakdown across discussions
2. Key recurring themes and public concerns
3. Notable insights or trends that could impact business decisions
4. Any significant differences in sentiment between subreddits

Keep response under 200 words and focus on actionable business insights.
`;

    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR 
      });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300
      });
      
      return response.choices[0]?.message?.content || `Found ${analyses.length} discussions about ${query} across Reddit business communities. Manual review recommended.`;
    } catch (error) {
      console.error('Error generating overall sentiment:', error);
      return `Found ${analyses.length} discussions about ${query} across Reddit business communities. Manual review recommended.`;
    }
  }
}

export const redditSentimentService = new RedditSentimentService();
