import OpenAI from 'openai';

interface HackerNewsComment {
  id: string;
  created_at: string;
  author: string;
  comment_text: string;
  story_id: string | null;
  story_title: string;
  story_url: string;
  points: number | null;
  num_comments: number | null;
  url: string;
}

interface HackerNewsSentimentResult {
  query: string;
  comments: Array<{
    text: string;
    author: string;
    storyTitle: string;
    url: string;
    createdAt: string;
    points: number | null;
  }>;
  overallSentiment: string;
}

export class HackerNewsSentimentService {
  private readonly baseUrl = 'https://hn.algolia.com/api/v1';

  async getHackerNewsSentiment(query: string): Promise<HackerNewsSentimentResult | null> {
    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.log('OPENAI_API_KEY not available, skipping Hacker News sentiment analysis');
        return null;
      }

      console.log(`Fetching Hacker News sentiment for: ${query}`);
      
      // Search for comments mentioning the query
      const comments = await this.searchHackerNewsComments(query);
      
      if (comments.length === 0) {
        console.log(`No Hacker News comments found for: ${query}`);
        return null;
      }
      
      // Analyze sentiment using centralized OpenAI service
      const sentimentAnalysis = await this.analyzeSentiment(query, comments);
      
      return {
        query,
        comments: comments.slice(0, 3).map(comment => ({
          text: comment.comment_text,
          author: comment.author,
          storyTitle: comment.story_title,
          url: `https://news.ycombinator.com/item?id=${comment.id}`,
          createdAt: comment.created_at,
          points: comment.points
        })),
        overallSentiment: sentimentAnalysis
      };
      
    } catch (error) {
      console.error('Error fetching Hacker News sentiment:', error);
      return null;
    }
  }

  private async searchHackerNewsComments(query: string): Promise<HackerNewsComment[]> {
    try {
      // Search for comments from the past week
      const response = await fetch(`${this.baseUrl}/search_by_date?query=${encodeURIComponent(query)}&tags=comment&hitsPerPage=20&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)}`);
      
      if (!response.ok) {
        throw new Error(`Hacker News search failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter and map the results
      const comments: HackerNewsComment[] = data.hits
        .filter((hit: any) => hit.comment_text && hit.comment_text.length > 50)
        .map((hit: any) => ({
          id: String(hit.objectID),
          created_at: hit.created_at,
          author: hit.author || 'Anonymous',
          comment_text: hit.comment_text,
          story_id: hit.story_id ? String(hit.story_id) : null,
          story_title: hit.story_title || 'Hacker News Discussion',
          story_url: hit.story_url || `https://news.ycombinator.com/item?id=${hit.story_id}`,
          points: hit.points,
          num_comments: hit.num_comments,
          url: `https://news.ycombinator.com/item?id=${hit.objectID}`
        }))
        .slice(0, 10); // Limit to top 10 for analysis

      console.log(`Found ${comments.length} Hacker News comments for: ${query}`);
      return comments;
      
    } catch (error) {
      console.error('Error searching Hacker News comments:', error);
      throw error;
    }
  }

  private async analyzeSentiment(query: string, comments: HackerNewsComment[]): Promise<string> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return "Sentiment analysis unavailable - no API key configured";
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const commentTexts = comments.map(c => `"${c.comment_text.slice(0, 300)}..."`).join('\n\n');
      
      const prompt = `Analyze the sentiment of these Hacker News comments about "${query}". 
      
Comments:
${commentTexts}

Provide a 2-3 sentence summary of the overall sentiment (positive, negative, or mixed) and the main themes discussed. Focus on what the developer/tech community thinks about this company/product. Be concise and professional.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing social sentiment from Hacker News discussions. Provide concise, professional summaries of community opinion."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || "Unable to analyze sentiment";
      
    } catch (error) {
      console.error('Error analyzing Hacker News sentiment:', error);
      return "Unable to analyze sentiment due to API error";
    }
  }
}

export const hackerNewsSentimentService = new HackerNewsSentimentService();