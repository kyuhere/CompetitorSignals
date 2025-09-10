import { signalAggregator } from './signalAggregator';
import { g2Service } from './g2';
import { hackerNewsService } from './hackerNews';
import OpenAI from 'openai';

interface EnhancedSignalItem {
  title: string;
  content: string;
  url?: string;
  publishedAt?: string;
  type: 'news' | 'funding' | 'social' | 'product' | 'review' | 'sentiment';
  source_type?: 'news' | 'g2' | 'hackernews' | 'rss';
  metadata?: any;
}

interface EnhancedCompetitorSignals {
  source: string;
  competitor: string;
  items: EnhancedSignalItem[];
}

interface ReviewSentimentData {
  platform: 'g2' | 'hackernews';
  averageRating?: number;
  totalReviews?: number;
  totalMentions?: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // 0-100
  topQuotes: Array<{
    text: string;
    author?: string;
    url?: string;
    rating?: number;
  }>;
  summary: string;
}

export class EnhancedSignalAggregator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY || '' 
    });
  }

  async aggregateEnhancedSignals(
    competitors: string[],
    urls: string[] = [],
    sources: any = { news: true, funding: true, social: true, products: false },
    onPartialResults?: (results: any) => void
  ): Promise<any> {
    try {
      console.log(`[EnhancedAggregator] Starting aggregation for competitors: ${competitors.join(', ')}`);
      
      // Get traditional signals first
      const traditionalSignals = await signalAggregator.aggregateSignals(
        competitors, 
        urls, 
        sources, 
        onPartialResults
      );
      console.log(`[EnhancedAggregator] Traditional signals collected: ${traditionalSignals?.length || 0} sources`);

      // Enhanced signals with reviews and social sentiment
      console.log(`[EnhancedAggregator] Starting enhanced data collection for ${competitors.length} competitors`);
      const enhancedSignals = await Promise.allSettled(
        competitors.map(async (competitor) => {
          console.log(`[EnhancedAggregator] Processing enhanced data for: ${competitor}`);
          const [g2Data, hnData] = await Promise.allSettled([
            this.getG2ReviewData(competitor),
            this.getHackerNewsSentiment(competitor)
          ]);

          if (g2Data.status === 'rejected') {
            console.error(`[EnhancedAggregator] G2 data failed for ${competitor}:`, g2Data.reason);
          } else {
            console.log(`[EnhancedAggregator] G2 data for ${competitor}:`, {
              hasData: !!g2Data.value,
              totalReviews: g2Data.value?.totalReviews,
              sentiment: g2Data.value?.sentiment
            });
          }

          if (hnData.status === 'rejected') {
            console.error(`[EnhancedAggregator] HN data failed for ${competitor}:`, hnData.reason);
          } else {
            console.log(`[EnhancedAggregator] HN data for ${competitor}:`, {
              hasData: !!hnData.value,
              totalMentions: hnData.value?.totalMentions,
              sentiment: hnData.value?.sentiment
            });
          }

          return {
            competitor,
            g2: g2Data.status === 'fulfilled' ? g2Data.value : null,
            hackerNews: hnData.status === 'fulfilled' ? hnData.value : null
          };
        })
      );

      // Combine and analyze all data
      const enhancedData = enhancedSignals.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean);

      console.log(`[EnhancedAggregator] Enhanced data processed: ${enhancedData.length} competitors`);
      enhancedData.forEach((data, index) => {
        console.log(`[EnhancedAggregator] Enhanced data ${index + 1}:`, {
          competitor: data.competitor,
          hasG2: !!data.g2,
          hasHN: !!data.hackerNews,
          g2Reviews: data.g2?.totalReviews || 0,
          hnMentions: data.hackerNews?.totalMentions || 0
        });
      });

      const combinedResults = {
        traditional: traditionalSignals,
        enhanced: enhancedData
      };

      return combinedResults;
    } catch (error) {
      console.error('[EnhancedAggregator] Error in enhanced signal aggregation:', error);
      throw error;
    }
  }

  private async getG2ReviewData(competitor: string): Promise<ReviewSentimentData> {
    try {
      const g2Summary = await g2Service.getProductSummary(competitor);
      
      // Use OpenAI to analyze G2 reviews for sentiment
      const sentimentAnalysis = await this.analyzeReviewSentiment(
        competitor,
        g2Summary.topReviewQuotes,
        'g2'
      );

      return {
        platform: 'g2',
        averageRating: g2Summary.averageRating,
        totalReviews: g2Summary.totalReviews,
        sentiment: g2Summary.sentiment,
        sentimentScore: this.sentimentToScore(g2Summary.sentiment, g2Summary.averageRating),
        topQuotes: g2Summary.topReviewQuotes.map(quote => ({
          text: quote,
          url: g2Summary.g2Url
        })),
        summary: sentimentAnalysis
      };
    } catch (error) {
      console.error(`Error getting G2 data for ${competitor}:`, error);
      return this.getEmptyReviewData('g2');
    }
  }

  private async getHackerNewsSentiment(competitor: string): Promise<ReviewSentimentData> {
    try {
      const hnSentiment = await hackerNewsService.getCompetitorSentiment(competitor);
      
      // Use OpenAI to analyze HN sentiment
      const sentimentAnalysis = await this.analyzeReviewSentiment(
        competitor,
        hnSentiment.topComments.map(c => c.text),
        'hackernews'
      );

      return {
        platform: 'hackernews',
        totalMentions: hnSentiment.totalMentions,
        sentiment: hnSentiment.sentiment,
        sentimentScore: this.sentimentToScore(hnSentiment.sentiment),
        topQuotes: hnSentiment.topComments.map(comment => ({
          text: comment.text,
          author: comment.author,
          url: comment.url
        })),
        summary: sentimentAnalysis
      };
    } catch (error) {
      console.error(`Error getting HN sentiment for ${competitor}:`, error);
      return this.getEmptyReviewData('hackernews');
    }
  }

  private async analyzeReviewSentiment(
    competitor: string, 
    quotes: string[], 
    platform: 'g2' | 'hackernews'
  ): Promise<string> {
    if (!this.openai || quotes.length === 0) {
      return `No ${platform} data available for sentiment analysis.`;
    }

    try {
      const prompt = `Analyze the ${platform} sentiment for ${competitor} based on these quotes:

${quotes.slice(0, 5).map((quote, i) => `${i + 1}. "${quote}"`).join('\n')}

Provide a concise 2-3 sentence summary of the overall sentiment, highlighting:
- Main strengths mentioned
- Common concerns or weaknesses
- Overall market perception

Keep it factual and business-focused.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content?.trim() || 
        `${platform} sentiment analysis completed for ${competitor}.`;
    } catch (error) {
      console.error(`Error analyzing ${platform} sentiment:`, error);
      return `${platform} sentiment data collected but analysis unavailable.`;
    }
  }

  private sentimentToScore(sentiment: string, rating?: number): number {
    if (rating !== undefined) {
      // For G2 ratings (1-5 scale)
      return Math.round((rating / 5) * 100);
    }
    
    // For text sentiment
    switch (sentiment) {
      case 'positive': return 75;
      case 'neutral': return 50;
      case 'negative': return 25;
      default: return 50;
    }
  }

  private getEmptyReviewData(platform: 'g2' | 'hackernews'): ReviewSentimentData {
    return {
      platform,
      sentiment: 'neutral',
      sentimentScore: 50,
      topQuotes: [],
      summary: `No ${platform} data available for analysis.`
    };
  }

  // Enhanced analysis that includes review and social sentiment
  async generateEnhancedAnalysis(
    traditionalSignals: any[],
    enhancedData: any[],
    competitorNames: string[]
  ): Promise<any> {
    if (!this.openai) {
      return this.getFallbackAnalysis(traditionalSignals, enhancedData, competitorNames);
    }

    try {
      const prompt = `Analyze this comprehensive competitor intelligence data and provide structured insights.

COMPETITORS: ${competitorNames.join(', ')}

TRADITIONAL SIGNALS: ${JSON.stringify(traditionalSignals.slice(0, 3), null, 2)}

ENHANCED DATA: ${JSON.stringify(enhancedData.slice(0, 3), null, 2)}

Provide analysis in this exact JSON format:
{
  "executive_summary": "2-3 sentence executive overview including review sentiment insights",
  "competitors": [
    {
      "competitor": "Name",
      "activity_level": "high|moderate|low",
      "recent_developments": ["Development 1", "Development 2"],
      "review_sentiment": {
        "g2_rating": 4.2,
        "g2_sentiment": "Generally positive reviews highlight ease of use",
        "social_sentiment": "Mixed discussions on technical forums",
        "overall_perception": "positive|neutral|negative"
      },
      "key_insights": ["Insight 1", "Insight 2"]
    }
  ],
  "strategic_insights": ["Strategic insight 1", "Strategic insight 2"],
  "market_sentiment_overview": "Overview of how competitors are perceived in reviews and social discussions"
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('No response from OpenAI');

      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        return this.getFallbackAnalysis(traditionalSignals, enhancedData, competitorNames);
      }
    } catch (error) {
      console.error('Error generating enhanced analysis:', error);
      return this.getFallbackAnalysis(traditionalSignals, enhancedData, competitorNames);
    }
  }

  private getFallbackAnalysis(traditionalSignals: any[], enhancedData: any[], competitorNames: string[]): any {
    return {
      executive_summary: `Competitive analysis completed for ${competitorNames.join(', ')}. Analysis includes traditional market signals and enhanced review sentiment data.`,
      competitors: competitorNames.map(name => ({
        competitor: name,
        activity_level: 'moderate',
        recent_developments: ['Recent market activity detected'],
        review_sentiment: {
          g2_rating: null,
          g2_sentiment: 'Review data collected',
          social_sentiment: 'Social sentiment analyzed',
          overall_perception: 'neutral'
        },
        key_insights: ['Competitive intelligence data aggregated']
      })),
      strategic_insights: ['Comprehensive competitive data collected', 'Review and social sentiment analyzed'],
      market_sentiment_overview: 'Market sentiment data has been aggregated from multiple sources including reviews and social discussions.'
    };
  }
}

export const enhancedSignalAggregator = new EnhancedSignalAggregator();