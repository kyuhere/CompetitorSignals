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

  async getCompetitorMentions(competitorName: string, dateRange: 'pastWeek' | 'pastMonth' = 'pastMonth'): Promise<HNSentimentData> {
    try {
      // Search for comments mentioning the competitor
      const commentsResponse = await axios.get(`${this.baseUrl}/search_by_date`, {
        params: {
          query: competitorName,
          tags: 'comment',
          numericFilters: this.getDateFilter(dateRange),
          hitsPerPage: 150
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
        comments: comments.slice(0, 50), // keep more for better selection later
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
    // Remove HTML tags, decode HTML entities (including numeric), and normalize whitespace
    const withoutTags = (text || '').replace(/<[^>]*>/g, ' ');
    const decoded = this.decodeHTMLEntities(withoutTags);
    return decoded.replace(/\s+/g, ' ').trim();
  }

  private decodeHTMLEntities(text: string): string {
    if (!text) return '';
    return text
      // Named entities
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Numeric decimal entities
      .replace(/&#(\d+);/g, (_, dec) => {
        const n = parseInt(dec, 10);
        return isFinite(n) ? String.fromCharCode(n) : _;
      })
      // Numeric hex entities
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const n = parseInt(hex, 16);
        return isFinite(n) ? String.fromCharCode(n) : _;
      });
  }

  private isRelevantComment(text: string, competitorName: string): boolean {
    const lowerText = text.toLowerCase();
    const lowerCompetitor = competitorName.toLowerCase();
    
    // Ensure explicit brand mention
    const mentionIndex = lowerText.indexOf(lowerCompetitor);
    if (mentionIndex === -1) return false;

    // Expand opinion signal vocabulary
    const opinionWords = [
      'love','hate','like','dislike','good','bad','great','terrible','awesome','awful','amazing','disappointing',
      'recommend','avoid','better','worse','prefer','alternative','versus','vs','experience','tried','used','switched','migrated',
      'doing great','doing good','consistently','value','improve','worsen','decline','not as good','don\'t like','not a fan',
      'happy','unhappy','satisfied','dissatisfied','complain','complaint','praise','criticize','criticise','love it','hate it'
    ];

    // Check presence of any opinion signal anywhere in the comment
    const hasOpinion = opinionWords.some(w => lowerText.includes(w));
    if (!hasOpinion) return false;

    return true;
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
    const data = await this.getCompetitorMentions(competitorName, 'pastMonth');
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
      topComments: data.comments
        .map(comment => ({
          text: this.extractOpinionSnippet(comment.text, competitorName),
          author: comment.author,
          url: comment.comment_url
        }))
        .filter(c => !!c.text)
        .slice(0, 3),
      topDiscussions: data.top_discussions.map(discussion => ({
        title: discussion.title,
        url: discussion.url,
        comments: discussion.comment_count
      }))
    };
  }

  private extractOpinionSnippet(text: string, competitorName: string): string {
    if (!text) return '';
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const lowerComp = (competitorName || '').toLowerCase();
    const opinionSignals = [
      'doing great','consistently','value','amazing','awesome','love','hate','don\'t like','not a fan','decline','improve','worse','better','disappointing','praise','criticize','criticise'
    ];

    // Prefer sentence containing competitor AND an opinion signal
    const withCompAndOpinion = sentences.find(s => s.toLowerCase().includes(lowerComp) && opinionSignals.some(w => s.toLowerCase().includes(w)));
    if (withCompAndOpinion) return withCompAndOpinion;

    // Otherwise any sentence that mentions the competitor
    const withComp = sentences.find(s => s.toLowerCase().includes(lowerComp));
    if (withComp) return withComp.length > 240 ? withComp.slice(0, 237) + '…' : withComp;

    // Fallback: first sentence truncated
    const first = sentences[0] || text;
    return first.length > 240 ? first.slice(0, 237) + '…' : first;
  }
}

export const hackerNewsService = new HackerNewsService();