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
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        console.warn("RAPIDAPI_KEY not configured, skipping news signals");
        return [];
      }

      // Search for multiple types of news about the competitor
      const searchQueries = [
        `${competitor} news recent`,
        `${competitor} funding investment`,
        `${competitor} announcement launch`,
        `${competitor} partnership acquisition`
      ];

      const allResults: SignalItem[] = [];

      for (const query of searchQueries) {
        try {
          const response = await fetch(
            `https://google-search74.p.rapidapi.com/?query=${encodeURIComponent(query)}&limit=5&related_keywords=true`,
            {
              method: 'GET',
              headers: {
                'x-rapidapi-host': 'google-search74.p.rapidapi.com',
                'x-rapidapi-key': rapidApiKey,
              },
            }
          );

          if (!response.ok) {
            console.error(`Google Search API error for "${query}":`, response.statusText);
            continue;
          }

          const data = await response.json();
          
          if (data.results) {
            const results = data.results.map((result: any) => ({
              title: result.title || '',
              content: result.description || result.snippet || '',
              url: result.url || result.link || '',
              publishedAt: new Date().toISOString(), // Google search doesn't provide publish dates
              type: this.detectSignalType(query, result.title, result.description) as 'news' | 'funding' | 'social' | 'product',
            }));
            
            allResults.push(...results);
          }

          // Add a small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching search results for "${query}":`, error);
          continue;
        }
      }

      // Remove duplicates and limit results
      const uniqueResults = allResults.filter((item, index, self) => 
        index === self.findIndex(t => t.url === item.url && t.title === item.title)
      );

      return uniqueResults.slice(0, 15); // Limit to 15 most relevant results
    } catch (error) {
      console.error("Error fetching news signals:", error);
      return [];
    }
  }

  private detectSignalType(query: string, title: string, description: string): 'news' | 'funding' | 'social' | 'product' {
    const text = (query + ' ' + title + ' ' + description).toLowerCase();
    
    if (text.includes('funding') || text.includes('investment') || text.includes('round') || text.includes('raised') || text.includes('venture')) {
      return 'funding';
    }
    
    if (text.includes('launch') || text.includes('release') || text.includes('feature') || text.includes('product') || text.includes('announcement')) {
      return 'product';
    }
    
    if (text.includes('twitter') || text.includes('social') || text.includes('tweet') || text.includes('linkedin')) {
      return 'social';
    }
    
    return 'news';
  }

  private async getFundingSignals(competitor: string): Promise<SignalItem[]> {
    try {
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        return [];
      }

      const fundingQuery = `${competitor} funding investment round raised venture capital`;
      
      const response = await fetch(
        `https://google-search74.p.rapidapi.com/?query=${encodeURIComponent(fundingQuery)}&limit=5&related_keywords=true`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'google-search74.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      
      if (data.results) {
        return data.results.map((result: any) => ({
          title: result.title || '',
          content: result.description || result.snippet || '',
          url: result.url || result.link || '',
          publishedAt: new Date().toISOString(),
          type: 'funding' as const,
        })).slice(0, 5);
      }

      return [];
    } catch (error) {
      console.error("Error fetching funding signals:", error);
      return [];
    }
  }

  private async getSocialSignals(competitor: string): Promise<SignalItem[]> {
    try {
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        return [];
      }

      const socialQuery = `${competitor} twitter linkedin social media mentions`;
      
      const response = await fetch(
        `https://google-search74.p.rapidapi.com/?query=${encodeURIComponent(socialQuery)}&limit=5&related_keywords=true`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'google-search74.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      
      if (data.results) {
        return data.results.map((result: any) => ({
          title: result.title || '',
          content: result.description || result.snippet || '',
          url: result.url || result.link || '',
          publishedAt: new Date().toISOString(),
          type: 'social' as const,
        })).slice(0, 5);
      }

      return [];
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
