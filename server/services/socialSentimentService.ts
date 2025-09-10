import { HackerNewsSentimentService } from './hackerNewsSentiment';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

interface Quote {
  text: string;
  author?: string;
  source?: string;
  url?: string;
  rating?: number;
}

interface ReviewData {
  averageRating: number;
  totalReviews: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  topQuotes: Quote[];
}

interface SocialMediaData {
  sentiment: 'positive' | 'negative' | 'neutral';
  totalMentions: number;
  platforms: string[];
  topQuotes: Quote[];
}

interface SocialSentimentResult {
  reviews?: ReviewData;
  socialMedia?: SocialMediaData;
  query: string;
}

export class SocialSentimentService {
  private hackerNewsService: HackerNewsSentimentService;

  constructor() {
    this.hackerNewsService = new HackerNewsSentimentService();
  }

  async analyzeSocialSentiment(query: string): Promise<SocialSentimentResult | null> {
    try {
      console.log(`Analyzing social sentiment for: ${query}`);

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.log('OPENAI_API_KEY not available, skipping social sentiment analysis');
        return null;
      }

      // Get data from Hacker News only
      const hackerNewsResult = await this.hackerNewsService.getHackerNewsSentiment(query);

      // If we have no data, return null
      if (!hackerNewsResult) {
        console.log('No social sentiment data available');
        return null;
      }

      // Aggregate social media data
      const socialMedia = await this.aggregateSocialMediaData(null, hackerNewsResult, query);

      return {
        socialMedia,
        query
      };

    } catch (error) {
      console.error('Error analyzing social sentiment:', error);
      return null;
    }
  }

  private async aggregateSocialMediaData(
    redditData: any, 
    hackerNewsData: any, 
    query: string
  ): Promise<SocialMediaData | undefined> {
    const platforms: string[] = [];
    const allQuotes: Quote[] = [];
    let totalMentions = 0;

    // Process Hacker News data only
    if (hackerNewsData && hackerNewsData.comments) {
      platforms.push('Hacker News');
      totalMentions += hackerNewsData.comments.length;
      
      hackerNewsData.comments.forEach((comment: any) => {
        allQuotes.push({
          text: comment.text,
          source: 'Hacker News',
          url: comment.url,
          author: comment.author
        });
      });
    }

    if (totalMentions === 0) {
      return undefined;
    }

    // Analyze overall sentiment using OpenAI
    const overallSentiment = await this.analyzeOverallSentiment(
      '',
      hackerNewsData?.overallSentiment || '',
      query
    );

    return {
      sentiment: overallSentiment,
      totalMentions,
      platforms,
      topQuotes: allQuotes.slice(0, 6) // Limit to top 6 quotes
    };
  }

  private async analyzeOverallSentiment(
    redditSentiment: string,
    hackerNewsSentiment: string,
    query: string
  ): Promise<'positive' | 'negative' | 'neutral'> {
    try {
      if (!redditSentiment && !hackerNewsSentiment) {
        return 'neutral';
      }

      // If OpenAI API key is not available, use a simple fallback
      if (!process.env.OPENAI_API_KEY) {
        console.log('Using fallback sentiment analysis (no OpenAI API key)');
        return this.analyzeSentimentFallback(redditSentiment, hackerNewsSentiment);
      }

      const prompt = `
Analyze the following sentiment summaries and determine the overall sentiment about "${query}":

Reddit Sentiment: ${redditSentiment || 'No data'}
Hacker News Sentiment: ${hackerNewsSentiment || 'No data'}

Based on these inputs, classify the overall sentiment as one of: positive, negative, or neutral.

Respond with only one word: positive, negative, or neutral`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 15,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.toLowerCase().trim();
      
      if (result === 'positive' || result === 'negative' || result === 'neutral') {
        return result;
      }
      
      return 'neutral';
    } catch (error) {
      console.error('Error analyzing overall sentiment:', error);
      // Fallback to simple analysis on API error
      return this.analyzeSentimentFallback(redditSentiment, hackerNewsSentiment);
    }
  }

  private analyzeSentimentFallback(
    redditSentiment: string, 
    hackerNewsSentiment: string
  ): 'positive' | 'negative' | 'neutral' {
    const combined = `${redditSentiment} ${hackerNewsSentiment}`.toLowerCase();
    
    // Simple keyword-based sentiment analysis
    const positiveWords = ['positive', 'good', 'great', 'excellent', 'love', 'amazing', 'wonderful', 'fantastic', 'impressive'];
    const negativeWords = ['negative', 'bad', 'terrible', 'awful', 'hate', 'horrible', 'disappointing', 'concerns', 'issues'];
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    positiveWords.forEach(word => {
      if (combined.includes(word)) positiveScore++;
    });
    
    negativeWords.forEach(word => {
      if (combined.includes(word)) negativeScore++;
    });
    
    if (positiveScore > negativeScore) {
      return 'positive';
    } else if (negativeScore > positiveScore) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  // Mock method for future G2 reviews integration
  async getReviewsData(query: string): Promise<ReviewData | undefined> {
    // This would integrate with G2 or other review services
    // For now, return mock data if needed for testing
    return undefined;
  }

  async getFullSentimentAnalysis(query: string): Promise<SocialSentimentResult | null> {
    const [socialResult, reviewsResult] = await Promise.allSettled([
      this.analyzeSocialSentiment(query),
      this.getReviewsData(query)
    ]);

    const socialData = socialResult.status === 'fulfilled' ? socialResult.value : null;
    const reviewsData = reviewsResult.status === 'fulfilled' ? reviewsResult.value : null;

    if (!socialData && !reviewsData) {
      return null;
    }

    return {
      socialMedia: socialData?.socialMedia,
      reviews: reviewsData,
      query
    };
  }
}

export const socialSentimentService = new SocialSentimentService();