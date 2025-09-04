import { parseRSSFeed } from "./rssParser";

interface SignalSource {
  news: boolean;
  funding: boolean;
  social: boolean;
  products: boolean;
}

interface SignalItem {
  title: string;
  content: string;
  url?: string;
  publishedAt?: string;
  type: 'news' | 'funding' | 'social' | 'product';
}

interface CompetitorSignals {
  source: string;
  competitor: string;
  items: SignalItem[];
}

class SignalAggregator {
  async aggregateSignals(
    competitors: string[],
    urls: string[] = [],
    sources: SignalSource = { news: true, funding: true, social: true, products: false }
  ): Promise<CompetitorSignals[]> {
    const results: CompetitorSignals[] = [];
    
    try {
      // Process RSS feeds if provided
      if (urls.length > 0) {
        for (const url of urls) {
          try {
            const feedItems = await parseRSSFeed(url);
            const relevantItems = this.filterRelevantItems(feedItems, competitors);
            
            if (relevantItems.length > 0) {
              results.push({
                source: `RSS: ${new URL(url).hostname}`,
                competitor: "Multiple",
                items: relevantItems,
              });
            }
          } catch (error) {
            console.error(`Error parsing RSS feed ${url}:`, error);
          }
        }
      }

      // Aggregate signals for each competitor
      for (const competitor of competitors) {
        const competitorSignals = await this.getCompetitorSignals(competitor, sources);
        if (competitorSignals.items.length > 0) {
          results.push(competitorSignals);
        }
      }

      return results;
    } catch (error) {
      console.error("Error aggregating signals:", error);
      throw new Error("Failed to aggregate competitor signals");
    }
  }

  private async getCompetitorSignals(
    competitor: string,
    sources: SignalSource
  ): Promise<CompetitorSignals> {
    const items: SignalItem[] = [];

    try {
      // News signals
      if (sources.news) {
        const newsItems = await this.getNewsSignals(competitor);
        items.push(...newsItems);
      }

      // Funding signals
      if (sources.funding) {
        const fundingItems = await this.getFundingSignals(competitor);
        items.push(...fundingItems);
      }

      // Social signals
      if (sources.social) {
        const socialItems = await this.getSocialSignals(competitor);
        items.push(...socialItems);
      }

      // Product signals (premium feature)
      if (sources.products) {
        const productItems = await this.getProductSignals(competitor);
        items.push(...productItems);
      }

      return {
        source: "Aggregated Sources",
        competitor,
        items: items.slice(0, 20), // Limit to most recent 20 items
      };
    } catch (error) {
      console.error(`Error getting signals for ${competitor}:`, error);
      return {
        source: "Aggregated Sources",
        competitor,
        items: [],
      };
    }
  }

  private async getNewsSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Use NewsAPI or similar service
      const newsApiKey = process.env.NEWS_API_KEY;
      if (!newsApiKey) {
        console.warn("NEWS_API_KEY not configured, skipping news signals");
        return [];
      }

      const response = await fetch(
        `https://newsapi.org/v2/everything?q="${competitor}"&sortBy=publishedAt&pageSize=10&apiKey=${newsApiKey}`
      );

      if (!response.ok) {
        console.error("News API error:", response.statusText);
        return [];
      }

      const data = await response.json();
      
      return (data.articles || []).map((article: any) => ({
        title: article.title,
        content: article.description || article.content?.substring(0, 200) || '',
        url: article.url,
        publishedAt: article.publishedAt,
        type: 'news' as const,
      }));
    } catch (error) {
      console.error("Error fetching news signals:", error);
      return [];
    }
  }

  private async getFundingSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Mock funding data - in production, use Crunchbase API or similar
      return [
        {
          title: `${competitor} funding activity`,
          content: `Recent funding and investment activity for ${competitor}`,
          type: 'funding' as const,
          publishedAt: new Date().toISOString(),
        }
      ];
    } catch (error) {
      console.error("Error fetching funding signals:", error);
      return [];
    }
  }

  private async getSocialSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Mock social data - in production, use Twitter API, Reddit API, etc.
      return [
        {
          title: `Social mentions of ${competitor}`,
          content: `Recent social media activity and mentions of ${competitor}`,
          type: 'social' as const,
          publishedAt: new Date().toISOString(),
        }
      ];
    } catch (error) {
      console.error("Error fetching social signals:", error);
      return [];
    }
  }

  private async getProductSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Premium feature - product launch detection
      return [
        {
          title: `${competitor} product updates`,
          content: `Recent product launches and updates from ${competitor}`,
          type: 'product' as const,
          publishedAt: new Date().toISOString(),
        }
      ];
    } catch (error) {
      console.error("Error fetching product signals:", error);
      return [];
    }
  }

  private filterRelevantItems(items: SignalItem[], competitors: string[]): SignalItem[] {
    return items.filter(item => 
      competitors.some(competitor => 
        item.title.toLowerCase().includes(competitor.toLowerCase()) ||
        item.content.toLowerCase().includes(competitor.toLowerCase())
      )
    );
  }
}

export const signalAggregator = new SignalAggregator();
