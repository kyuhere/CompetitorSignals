import { signalAggregator } from './signalAggregator';
import { hackerNewsService } from './hackerNews';
import { trustpilotService } from './trustpilot';
import OpenAI from 'openai';
import { openaiWebSearch } from './openaiWebSearch';

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
  platform: 'trustpilot' | 'hackernews' | 'g2';
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
    onPartialResults?: (results: any) => void,
    options?: { mode?: 'free' | 'premium'; computeSentiment?: boolean; domainsByCompetitor?: Record<string, string | null | undefined> }
  ): Promise<any> {
    try {
      const mode = options?.mode ?? 'premium';
      const computeSentiment = options?.computeSentiment ?? true;
      console.log(`[EnhancedAggregator] Starting aggregation for competitors: ${competitors.join(', ')} (mode=${mode}, computeSentiment=${computeSentiment})`);

      // Start traditional signals in parallel with enhanced collection
      const traditionalPromise = signalAggregator.aggregateSignals(
        competitors,
        urls,
        sources,
        onPartialResults
      );

      // Enhanced signals with reviews and social sentiment (run per-competitor in parallel with timeouts)
      console.log(`[EnhancedAggregator] Starting enhanced data collection for ${competitors.length} competitors`);
      const enhancedPerCompetitor = competitors.map(async (competitor) => {
        console.log(`[EnhancedAggregator] Processing enhanced data for: ${competitor}`);
        const domain = options?.domainsByCompetitor?.[competitor] || options?.domainsByCompetitor?.[competitor.toLowerCase()];
        
        // Add timeouts to prevent hanging
        const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
          return Promise.race([
            promise,
            new Promise<T>((_, reject) => 
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            )
          ]);
        };

        const [tpData, hnData] = await Promise.allSettled([
          (options?.mode === 'premium') ? 
            withTimeout(this.getTrustpilotReviewData(competitor, domain, computeSentiment), 15000) : 
            Promise.resolve(null),
          withTimeout(this.getHackerNewsSentiment(competitor, computeSentiment, domain), 10000)
        ]);

        if (tpData.status === 'rejected') {
          console.error(`[EnhancedAggregator] Trustpilot data failed for ${competitor}:`, tpData.reason);
        } else {
          console.log(`[EnhancedAggregator] Trustpilot data for ${competitor}:`, {
            hasData: !!(tpData as any).value,
            totalReviews: (tpData as any).value?.totalReviews,
            sentiment: (tpData as any).value?.sentiment
          });
        }

        if (hnData.status === 'rejected') {
          console.error(`[EnhancedAggregator] HN data failed for ${competitor}:`, hnData.reason);
        } else {
          console.log(`[EnhancedAggregator] HN data for ${competitor}:`, {
            hasData: !!(hnData as any).value,
            totalMentions: (hnData as any).value?.totalMentions,
            sentiment: (hnData as any).value?.sentiment
          });
        }

        const partial = {
          competitor,
          trustpilot: tpData.status === 'fulfilled' ? tpData.value : null,
          hackerNews: hnData.status === 'fulfilled' ? hnData.value : null
        };

        // Emit per-competitor enhanced partials if a callback is provided
        try {
          onPartialResults?.({ enhancedPartial: partial });
        } catch (e) {
          // non-fatal
        }

        return partial;
      });

      // Await both traditional and enhanced concurrently
      const [traditionalSignals, enhancedSettled] = await Promise.all([
        traditionalPromise,
        Promise.allSettled(enhancedPerCompetitor)
      ]);
      console.log(`[EnhancedAggregator] Traditional signals collected: ${traditionalSignals?.length || 0} sources`);

      // Combine and analyze all data
      const enhancedData = enhancedSettled.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean);

      console.log(`[EnhancedAggregator] Enhanced data processed: ${enhancedData.length} competitors`);
      enhancedData.forEach((data, index) => {
        if (data) {
          console.log(`[EnhancedAggregator] Enhanced data ${index + 1}:`, {
            competitor: (data as any).competitor,
            hasTrustpilot: !!(data as any).trustpilot,
            hasHN: !!(data as any).hackerNews,
            trustpilotReviews: (data as any).trustpilot?.totalReviews || 0,
            hnMentions: (data as any).hackerNews?.totalMentions || 0
          });
        }
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

  private async getTrustpilotReviewData(competitor: string, domain?: string | null, computeSentiment: boolean = true): Promise<ReviewSentimentData | null> {
    try {
      if (!domain) {
        return null;
      }
      const tp = await trustpilotService.getCompanyReviewsByDomain(domain);
      if (!tp) return null;

      const topTexts = (tp.reviews || [])
        .map(r => r.reviewText || r.reviewTitle)
        .filter(Boolean)
        .slice(0, 5) as string[];

      let sentimentAnalysis: string;
      if (computeSentiment && topTexts.length > 0) {
        sentimentAnalysis = await this.analyzeReviewSentiment(
          competitor,
          topTexts,
          'trustpilot'
        );
      } else {
        // Provide a data-based fallback summary when no quotes are available
        if (tp.averageRating != null && tp.totalReviews != null) {
          const overall = tp.averageRating >= 4 ? 'generally positive' : tp.averageRating >= 2.5 ? 'mixed/neutral' : 'generally negative';
          sentimentAnalysis = `Trustpilot shows an average rating of ${tp.averageRating.toFixed(1)} from ${tp.totalReviews} reviews — ${overall} perception.`;
        } else if (tp.averageRating != null) {
          const overall = tp.averageRating >= 4 ? 'positive' : tp.averageRating >= 2.5 ? 'neutral' : 'negative';
          sentimentAnalysis = `Trustpilot average rating is ${tp.averageRating.toFixed(1)} (${overall}).`;
        } else {
          sentimentAnalysis = 'Trustpilot data collected.';
        }
      }

      // Derive a coarse sentiment from average rating if available
      const coarseSentiment = tp.averageRating != null
        ? (tp.averageRating >= 4 ? 'positive' : tp.averageRating >= 2.5 ? 'neutral' : 'negative')
        : 'neutral';

      return {
        platform: 'trustpilot',
        averageRating: tp.averageRating,
        totalReviews: tp.totalReviews,
        sentiment: coarseSentiment as 'positive' | 'neutral' | 'negative',
        sentimentScore: this.sentimentToScore(coarseSentiment, tp.averageRating),
        topQuotes: (tp.reviews || []).slice(0, 3).map(r => ({
          text: r.reviewText || r.reviewTitle || '',
          url: r.reviewUrl || tp.sourceUrl,
          rating: r.rating,
        })),
        summary: sentimentAnalysis,
      };
    } catch (error) {
      console.error(`Error getting Trustpilot data for ${competitor}:`, error);
      return null;
    }
  }

  private async getHackerNewsSentiment(competitor: string, computeSentiment: boolean = true, domain?: string | null): Promise<ReviewSentimentData> {
    try {
      // Web-search first path (feature-flagged)
      if (process.env.OPENAI_ENABLE_WEB_ENHANCED === '1') {
        try {
          const webResult = await openaiWebSearch.fetchSocialSentiment(competitor, domain || undefined);
          if (webResult) {
            return webResult;
          }
        } catch (e) {
          console.error('[EnhancedAggregator] Web social sentiment failed, falling back', { competitor, error: (e as Error)?.message });
        }
      }

      const hnSentiment = await hackerNewsService.getCompetitorSentiment(competitor);

      // Use OpenAI to analyze HN sentiment
      const sentimentAnalysis = computeSentiment
        ? await this.analyzeReviewSentiment(
            competitor,
            hnSentiment.topComments.map(c => c.text),
            'hackernews'
          )
        : 'HN sentiment data collected. Upgrade to premium for AI-powered sentiment analysis.';

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
    platform: 'trustpilot' | 'hackernews' | 'g2'
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
        // Clean up markdown JSON formatting if present
        let cleanContent = content;
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Original content:', content);
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