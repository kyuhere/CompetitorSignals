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
    sources: SignalSource = { news: true, funding: true, social: true, products: false },
    onPartialResults?: (results: CompetitorSignals[]) => void
  ): Promise<CompetitorSignals[]> {
    const results: CompetitorSignals[] = [];
    
    try {
      // Create all async tasks for parallel execution
      const tasks: Promise<CompetitorSignals | null>[] = [];
      
      // Process RSS feeds in parallel if provided
      if (urls.length > 0) {
        urls.forEach(url => {
          tasks.push(
            parseRSSFeed(url)
              .then(feedItems => {
                const relevantItems = this.filterRelevantItems(feedItems, competitors);
                if (relevantItems.length > 0) {
                  return {
                    source: `RSS: ${new URL(url).hostname}`,
                    competitor: "Multiple",
                    items: this.trimContent(relevantItems),
                  };
                }
                return null;
              })
              .catch(error => {
                console.error(`Error parsing RSS feed ${url}:`, error);
                return null;
              })
          );
        });
      }

      // Process competitor signals in parallel
      competitors.forEach(competitor => {
        tasks.push(
          this.getCompetitorSignals(competitor, sources)
            .then(competitorSignals => {
              if (competitorSignals.items.length > 0) {
                return {
                  ...competitorSignals,
                  items: this.trimContent(competitorSignals.items)
                };
              }
              return null;
            })
            .catch(error => {
              console.error(`Error getting signals for ${competitor}:`, error);
              return null;
            })
        );
      });

      // Execute all tasks in parallel and collect results as they complete
      const taskResults = await Promise.allSettled(tasks);
      
      taskResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
          
          // Call callback for streaming partial results
          if (onPartialResults) {
            onPartialResults([...results]);
          }
        }
      });

      return results;
    } catch (error) {
      console.error("Error aggregating signals:", error);
      throw new Error("Failed to aggregate competitor signals");
    }
  }

  // Trim content to essential information only
  private trimContent(items: SignalItem[]): SignalItem[] {
    return items.map(item => ({
      ...item,
      content: this.trimTextContent(item.content),
    }));
  }

  // Trim text to headline, summary, and key details only (max 300 chars)
  private trimTextContent(content: string): string {
    if (!content) return '';
    
    // Remove HTML tags
    const cleanContent = content.replace(/<[^>]*>/g, '');
    
    // Extract first paragraph or sentence that looks like a summary
    const sentences = cleanContent.split(/[.!?]+/);
    let summary = sentences[0] || '';
    
    // If first sentence is too short, try to get more context
    if (summary.length < 100 && sentences[1]) {
      summary += '. ' + sentences[1];
    }
    
    // Limit to 300 characters for efficiency
    return summary.substring(0, 300).trim();
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
      // Search for multiple types of news about the competitor using Bing RSS
      const searchQueries = [
        `${competitor} news recent`,
        `${competitor} funding investment`,
        `${competitor} announcement launch`,
        `${competitor} partnership acquisition`
      ];

      const allResults: SignalItem[] = [];

      for (const query of searchQueries) {
        try {
          const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(query)}`;
          const rssItems = await parseRSSFeed(rssUrl);
          
          const results = rssItems.map((item: any) => ({
            title: item.title || '',
            content: item.description || item.content || '',
            url: item.link || '',
            publishedAt: item.pubDate || new Date().toISOString(),
            type: this.detectSignalType(query, item.title, item.description) as 'news' | 'funding' | 'social' | 'product',
          }));
          
          allResults.push(...results);

          // Add a small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching RSS results for "${query}":`, error);
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
      const fundingQuery = `${competitor} funding investment round raised venture capital`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(fundingQuery)}`;
      const rssItems = await parseRSSFeed(rssUrl);
      
      return rssItems.map((item: any) => ({
        title: item.title || '',
        content: item.description || item.content || '',
        url: item.link || '',
        publishedAt: item.pubDate || new Date().toISOString(),
        type: 'funding' as const,
      })).slice(0, 5);
    } catch (error) {
      console.error("Error fetching funding signals:", error);
      return [];
    }
  }

  private async getSocialSignals(competitor: string): Promise<SignalItem[]> {
    try {
      const socialQuery = `${competitor} twitter linkedin social media mentions`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(socialQuery)}`;
      const rssItems = await parseRSSFeed(rssUrl);
      
      return rssItems.map((item: any) => ({
        title: item.title || '',
        content: item.description || item.content || '',
        url: item.link || '',
        publishedAt: item.pubDate || new Date().toISOString(),
        type: 'social' as const,
      })).slice(0, 5);
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
