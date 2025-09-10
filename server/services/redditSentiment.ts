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
}

interface RedditSentimentResult {
  query: string;
  posts: PostAnalysis[];
  overallSentiment: string;
}

class RedditSentimentService {
  private readonly HEADERS = {
    'User-Agent': 'Competitor-Lemonade-Bot/1.0'
  };

  // Focus on business and news-relevant subreddits
  private readonly RELEVANT_SUBREDDITS = [
    'news', 'worldnews', 'business', 'technology', 'stocks', 
    'wallstreetbets', 'investing', 'entrepreneur', 'startups',
    'tech', 'finance', 'economy'
  ];

  async searchRedditPosts(query: string, limit: number = 10): Promise<RedditPost[]> {
    try {
      // Generate unique IDs for the search request
      const cId = this.generateUniqueId();
      const iId = this.generateUniqueId();
      
      const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&type=posts&t=week&cId=${cId}&iId=${iId}&sort=new&limit=${limit}`;
      
      console.log(`Reddit search URL: ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: this.HEADERS
      });

      if (!response.ok) {
        console.error(`Reddit search failed: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error('Reddit API response:', errorText);
        throw new Error(`Reddit search failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Reddit API returned ${data?.data?.children?.length || 0} posts`);
      
      const posts: RedditPost[] = [];

      if (!data?.data?.children) {
        console.log('No children found in Reddit response');
        return [];
      }

      for (const child of data.data.children) {
        const postData = child.data;
        
        // Filter for relevant subreddits only
        if (this.RELEVANT_SUBREDDITS.includes(postData.subreddit.toLowerCase())) {
          posts.push({
            title: postData.title,
            subreddit: postData.subreddit,
            permalink: postData.permalink,
            num_comments: postData.num_comments,
            url: postData.url
          });
          console.log(`Found relevant post: ${postData.title.substring(0, 50)}... in r/${postData.subreddit}`);
        }
      }

      console.log(`Filtered to ${posts.length} relevant posts from business subreddits`);
      return posts.slice(0, limit);
    } catch (error) {
      console.error('Error searching Reddit posts:', error);
      return [];
    }
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  async fetchComments(permalink: string, limit: number = 20): Promise<string[]> {
    try {
      const commentsUrl = `https://www.reddit.com${permalink}.json`;
      
      const response = await fetch(commentsUrl, {
        headers: this.HEADERS
      });

      if (!response.ok) {
        throw new Error(`Reddit comments fetch failed: ${response.status}`);
      }

      const data = await response.json();
      const comments: string[] = [];

      // The second element contains the comments
      if (data.length > 1 && data[1].data && data[1].data.children) {
        for (const comment of data[1].data.children) {
          const commentData = comment.data;
          const body = commentData.body;
          
          // Skip deleted, removed, or very short comments
          if (body && 
              body !== '[deleted]' && 
              body !== '[removed]' && 
              body.length > 10) {
            comments.push(body);
            
            if (comments.length >= limit) {
              break;
            }
          }
        }
      }

      return comments;
    } catch (error) {
      console.error('Error fetching Reddit comments:', error);
      return [];
    }
  }

  async analyzeSentiment(comments: string[], query: string, postTitle: string): Promise<string> {
    if (!comments.length) {
      return "No meaningful comments found.";
    }

    // Limit comments for token efficiency
    const limitedComments = comments.slice(0, 15);
    const commentsText = limitedComments.map(c => `- ${c}`).join('\n');

    const prompt = `
You are analyzing Reddit public sentiment about "${query}" based on comments from the post: "${postTitle}"

Comments:
${commentsText}

Provide a concise analysis including:
1. Overall sentiment (positive, negative, neutral, or mixed)
2. Key themes or concerns mentioned
3. Most representative opinions (if any)

Keep response under 150 words and focus on actionable insights.
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
        max_tokens: 300
      });
      
      return response.choices[0]?.message?.content || `Unable to analyze sentiment. Found ${comments.length} comments discussing ${query}.`;
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return `Unable to analyze sentiment. Found ${comments.length} comments discussing ${query}.`;
    }
  }

  async getRedditSentiment(query: string): Promise<RedditSentimentResult> {
    console.log(`Starting Reddit sentiment analysis for: ${query}`);

    // Extract company name if query is a URL
    const searchQuery = this.extractCompanyFromUrl(query);
    console.log(`Search query after URL extraction: ${searchQuery}`);
    
    const posts = await this.searchRedditPosts(searchQuery, 8);
    console.log(`Found ${posts.length} posts for analysis`);
    
    if (posts.length === 0) {
      console.log('No posts found, returning empty result');
      return {
        query: searchQuery,
        posts: [],
        overallSentiment: `No recent Reddit discussions found about ${searchQuery} in relevant business/news subreddits in the past week.`
      };
    }

    const analyses: PostAnalysis[] = [];

    for (const post of posts) {
      console.log(`Analyzing post: ${post.title.substring(0, 50)}... from r/${post.subreddit}`);
      
      const comments = await this.fetchComments(post.permalink, 20);
      console.log(`Fetched ${comments.length} comments for post: ${post.title.substring(0, 30)}...`);
      
      const summary = await this.analyzeSentiment(comments, searchQuery, post.title);

      analyses.push({
        title: post.title,
        subreddit: post.subreddit,
        comments: post.num_comments,
        summary,
        url: post.url
      });

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Completed analysis of ${analyses.length} posts`);

    // Generate overall sentiment summary
    const overallSentiment = await this.generateOverallSentiment(analyses, searchQuery);

    const result = {
      query: searchQuery,
      posts: analyses,
      overallSentiment
    };

    console.log(`Reddit sentiment analysis completed. Result:`, {
      query: result.query,
      postsCount: result.posts.length,
      overallSentimentLength: result.overallSentiment.length
    });

    return result;
  }

  private extractCompanyFromUrl(input: string): string {
    // If it's a URL, try to extract company name
    if (input.includes('http') || input.includes('.com')) {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      if (urlMatch) {
        const domain = urlMatch[1];
        // Extract company name from domain (e.g., "openai.com" -> "openai")
        const companyMatch = domain.match(/([^\.]+)\./);
        return companyMatch ? companyMatch[1] : domain;
      }
    }
    
    return input; // Return as-is if not a URL
  }

  private async generateOverallSentiment(analyses: PostAnalysis[], query: string): Promise<string> {
    if (!analyses.length) {
      return `No recent Reddit discussions found about ${query} in relevant business/news subreddits.`;
    }

    const summariesText = analyses.map((analysis, index) => 
      `${index + 1}. r/${analysis.subreddit}: ${analysis.summary}`
    ).join('\n\n');

    const prompt = `
Based on these Reddit post analyses about "${query}" from the past week, provide an overall public sentiment summary:

${summariesText}

Provide:
1. Overall sentiment breakdown (positive/negative/neutral percentages or description)
2. Key recurring themes across all discussions
3. Most notable public opinions or concerns

Keep response under 200 words and focus on actionable business insights.
`;

    try {
      // Direct OpenAI call for overall sentiment analysis
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
      
      return response.choices[0]?.message?.content || `Found ${analyses.length} discussions about ${query} across business and tech subreddits. Manual review recommended.`;
    } catch (error) {
      console.error('Error generating overall sentiment:', error);
      return `Found ${analyses.length} discussions about ${query} across business and tech subreddits. Manual review recommended.`;
    }
  }
}

export const redditSentimentService = new RedditSentimentService();