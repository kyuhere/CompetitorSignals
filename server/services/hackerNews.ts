import axios from 'axios';

export interface HNComment {
  id: string;
  text: string;
  author: string;
  points: number;
  created_at: string;
  story_title: string;
  story_url: string;
  comment_url: string;
}

export interface HNSentimentData {
  query: string;
  total_comments: number;
  comments: HNComment[];
  sentiment_summary: {
    positive: number;
    neutral: number;
    negative: number;
    overall: 'positive' | 'neutral' | 'negative';
  };
  top_discussions: Array<{
    title: string;
    url: string;
    comment_count: number;
  }>;
}

export class HackerNewsService {
  private readonly baseUrl = 'https://hn.algolia.com/api/v1';

  async getCompetitorMentions(competitorName: string, dateRange: 'pastWeek' | 'pastMonth' = 'pastWeek'): Promise<HNSentimentData> {
    try {
      // Search for comments mentioning the competitor
      const commentsResponse = await axios.get(`${this.baseUrl}/search_by_date`, {
        params: {
          query: competitorName,
          tags: 'comment',
          numericFilters: this.getDateFilter(dateRange),
          hitsPerPage: 50
        },
        timeout: 10000
      });

      // Search for stories mentioning the competitor
      const storiesResponse = await axios.get(`${this.baseUrl}/search_by_date`, {
        params: {
          query: competitorName,
          tags: 'story',
          numericFilters: this.getDateFilter(dateRange),
          hitsPerPage: 20
        },
        timeout: 10000
      });

      const comments = this.normalizeComments(commentsResponse.data.hits || [], competitorName);
      const stories = this.normalizeStories(storiesResponse.data.hits || []);

      return {
        query: competitorName,
        total_comments: comments.length,
        comments: comments.slice(0, 20), // Limit to top 20 for processing
        sentiment_summary: this.calculateBasicSentiment(comments),
        top_discussions: stories.slice(0, 5)
      };

    } catch (error) {
      console.error(`Hacker News API error for ${competitorName}:`, error);
      
      return {
        query: competitorName,
        total_comments: 0,
        comments: [],
        sentiment_summary: {
          positive: 0,
          neutral: 0,
          negative: 0,
          overall: 'neutral'
        },
        top_discussions: []
      };
    }
  }

  private getDateFilter(dateRange: 'pastWeek' | 'pastMonth'): string {
    const now = Math.floor(Date.now() / 1000);
    const secondsInWeek = 7 * 24 * 60 * 60;
    const secondsInMonth = 30 * 24 * 60 * 60;
    
    const cutoff = dateRange === 'pastWeek' 
      ? now - secondsInWeek 
      : now - secondsInMonth;
    
    return `created_at_i>${cutoff}`;
  }

  private normalizeComments(hits: any[], competitorName: string): HNComment[] {
    return hits
      .filter(hit => hit.comment_text && hit.comment_text.length > 20)
      .map(hit => ({
        id: hit.objectID,
        text: this.cleanCommentText(hit.comment_text),
        author: hit.author || 'Anonymous',
        points: hit.points || 0,
        created_at: new Date(hit.created_at || hit.created_at_i * 1000).toISOString(),
        story_title: hit.story_title || 'Untitled',
        story_url: hit.story_url || `https://news.ycombinator.com/item?id=${hit.story_id}`,
        comment_url: `https://news.ycombinator.com/item?id=${hit.objectID}`
      }))
      .filter(comment => this.isRelevantComment(comment.text, competitorName))
      .sort((a, b) => b.points - a.points); // Sort by points (engagement)
  }

  private normalizeStories(hits: any[]): Array<{title: string; url: string; comment_count: number}> {
    return hits
      .filter(hit => hit.title && hit.title.length > 5)
      .map(hit => ({
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        comment_count: hit.num_comments || 0
      }))
      .sort((a, b) => b.comment_count - a.comment_count);
  }

  private cleanCommentText(text: string): string {
    // Remove HTML tags and normalize whitespace
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isRelevantComment(text: string, competitorName: string): boolean {
    const lowerText = text.toLowerCase();
    const lowerCompetitor = competitorName.toLowerCase();
    
    // Check if competitor name appears with some context (not just a passing mention)
    const mentionIndex = lowerText.indexOf(lowerCompetitor);
    if (mentionIndex === -1) return false;
    
    // Get surrounding context (50 characters before and after)
    const start = Math.max(0, mentionIndex - 50);
    const end = Math.min(text.length, mentionIndex + competitorName.length + 50);
    const context = lowerText.substring(start, end);
    
    // Look for opinion words or discussion indicators
    const opinionWords = [
      'love', 'hate', 'like', 'dislike', 'good', 'bad', 'great', 'terrible',
      'awesome', 'awful', 'amazing', 'disappointing', 'recommend', 'avoid',
      'better', 'worse', 'prefer', 'alternative', 'compared', 'versus', 'vs',
      'experience', 'tried', 'used', 'switched', 'migrated'
    ];
    
    return opinionWords.some(word => context.includes(word));
  }

  private calculateBasicSentiment(comments: HNComment[]): {
    positive: number;
    neutral: number;
    negative: number;
    overall: 'positive' | 'neutral' | 'negative';
  } {
    if (comments.length === 0) {
      return { positive: 0, neutral: 0, negative: 0, overall: 'neutral' };
    }

    const sentiments = comments.map(comment => this.analyzeCommentSentiment(comment.text));
    
    const positive = sentiments.filter(s => s === 'positive').length;
    const negative = sentiments.filter(s => s === 'negative').length;
    const neutral = sentiments.filter(s => s === 'neutral').length;

    let overall: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positive > negative * 1.5) overall = 'positive';
    else if (negative > positive * 1.5) overall = 'negative';

    return {
      positive: Math.round((positive / comments.length) * 100),
      neutral: Math.round((neutral / comments.length) * 100),
      negative: Math.round((negative / comments.length) * 100),
      overall
    };
  }

  private analyzeCommentSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const lowerText = text.toLowerCase();
    
    const positiveWords = [
      'love', 'like', 'good', 'great', 'awesome', 'amazing', 'excellent',
      'fantastic', 'wonderful', 'perfect', 'best', 'better', 'recommend',
      'impressed', 'solid', 'reliable', 'easy', 'helpful', 'useful'
    ];
    
    const negativeWords = [
      'hate', 'dislike', 'bad', 'terrible', 'awful', 'horrible', 'worst',
      'worse', 'disappointing', 'frustrating', 'broken', 'buggy', 'avoid',
      'problem', 'issue', 'difficult', 'confusing', 'slow', 'expensive'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveScore++;
    });

    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeScore++;
    });

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  // Get summary for competitor reports
  async getCompetitorSentiment(competitorName: string): Promise<{
    platform: 'hackernews';
    totalMentions: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    sentimentBreakdown: {positive: number; neutral: number; negative: number};
    topComments: Array<{text: string; author: string; url: string}>;
    topDiscussions: Array<{title: string; url: string; comments: number}>;
  }> {
    console.log(`[HackerNews] Getting competitor sentiment for: ${competitorName}`);
    const data = await this.getCompetitorMentions(competitorName);
    console.log(`[HackerNews] Mentions found for ${competitorName}:`, {
      totalComments: data.total_comments,
      sentiment: data.sentiment_summary.overall,
      topDiscussions: data.top_discussions.length
    });
    
    return {
      platform: 'hackernews',
      totalMentions: data.total_comments,
      sentiment: data.sentiment_summary.overall,
      sentimentBreakdown: {
        positive: data.sentiment_summary.positive,
        neutral: data.sentiment_summary.neutral,
        negative: data.sentiment_summary.negative
      },
      topComments: data.comments.slice(0, 3).map(comment => ({
        text: comment.text.substring(0, 200) + (comment.text.length > 200 ? '...' : ''),
        author: comment.author,
        url: comment.comment_url
      })),
      topDiscussions: data.top_discussions.map(discussion => ({
        title: discussion.title,
        url: discussion.url,
        comments: discussion.comment_count
      }))
    };
  }
}

export const hackerNewsService = new HackerNewsService();