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
  // Calculate text similarity using Jaccard index
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    const words1 = new Set(text1.toLowerCase().split(/\\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
  async aggregateSignals(
    competitors: string[],
    urls: string[] = [],
    sources: SignalSource = { news: true, funding: true, social: true, products: false },
    onPartialResults?: (results: CompetitorSignals[]) => void
  ): Promise<CompetitorSignals[]> {
    // Skip default RSS feeds to avoid irrelevant content
    // Focus only on user-provided URLs and targeted news searches
    const allUrls = [...urls]; // Only use user-provided RSS feeds
    const results: CompetitorSignals[] = [];
    
    try {
      // Create all async tasks for parallel execution
      const tasks: Promise<CompetitorSignals | null>[] = [];
      
      // Process RSS feeds in parallel (including default feeds)
      if (allUrls.length > 0) {
        allUrls.forEach(url => {
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

      // Add RapidAPI news search for each competitor
      if (process.env.RAPIDAPI_KEY) {
        competitors.forEach(competitor => {
          tasks.push(
            this.getRapidAPINews(competitor)
              .then((rapidAPISignals: CompetitorSignals) => {
                if (rapidAPISignals.items.length > 0) {
                  return {
                    ...rapidAPISignals,
                    items: this.trimContent(rapidAPISignals.items)
                  };
                }
                return null;
              })
              .catch((error: any) => {
                console.error(`Error getting RapidAPI signals for ${competitor}:`, error);
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
      // Search for business-critical news about the competitor
      const searchQueries = [
        `"${competitor}" funding raised investment revenue earnings`,
        `"${competitor}" layoffs hiring expansion growth`,
        `"${competitor}" product launch new features`,
        `"${competitor}" acquisition merger partnership deal`
      ];

      const allResults: SignalItem[] = [];

      for (const query of searchQueries) {
        try {
          const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(query)}&sortby=date&since=90days&count=10`;
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

      // Enhanced deduplication and filtering
      const filteredResults = allResults.filter(item => {
        // Apply the same date and relevance filtering as RSS feeds
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        if (item.publishedAt) {
          const publishedDate = new Date(item.publishedAt);
          if (publishedDate < threeMonthsAgo) return false;
        }
        
        return true;
      });
      
      // Sophisticated deduplication - remove similar titles and URLs
      const uniqueResults = filteredResults.filter((item, index, self) => {
        return index === self.findIndex(t => {
          // Exact URL match
          if (t.url === item.url && t.url) return true;
          
          // Similar title match - simple word comparison  
          const title1Words = t.title.toLowerCase().split(' ');
          const title2Words = item.title.toLowerCase().split(' ');
          const commonWords = title1Words.filter(word => title2Words.includes(word));
          const similarity = commonWords.length / Math.max(title1Words.length, title2Words.length);
          return similarity < 0.8;
        });
      });
      
      // Sort by date (newest first) and limit results
      const sortedResults = uniqueResults
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, 10); // Reduced to 10 most recent and relevant results
        
      return sortedResults;
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
      const fundingQuery = `"${competitor}" "funding" OR "investment" OR "raised" OR "revenue" OR "valuation" OR "IPO"`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(fundingQuery)}&sortby=date&since=90days&count=5`;
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
      const socialQuery = `"${competitor}" "customers" OR "reviews" OR "complaints" OR "satisfaction" OR "market share"`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(socialQuery)}&sortby=date&since=90days&count=5`;
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

  private async getRapidAPINews(competitor: string): Promise<CompetitorSignals> {
    try {
      if (!process.env.RAPIDAPI_KEY) {
        return { source: "RapidAPI News", competitor, items: [] };
      }

      const searchQuery = `${competitor} news recent developments`;
      const response = await fetch(
        `https://real-time-news-data.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&country=US&lang=en&time_published=7d&limit=10`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'real-time-news-data.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY
          }
        }
      );

      if (!response.ok) {
        throw new Error(`RapidAPI request failed: ${response.status}`);
      }

      const data = await response.json();
      const items = data.data?.slice(0, 8).map((article: any) => ({
        title: article.title || '',
        content: article.snippet || article.summary || '',
        url: article.link || article.url || '',
        publishedAt: article.published_datetime_utc || new Date().toISOString(),
        type: 'news' as const,
      })) || [];

      return {
        source: "RapidAPI News",
        competitor,
        items,
      };
    } catch (error) {
      console.error(`Error fetching RapidAPI news for ${competitor}:`, error);
      return { source: "RapidAPI News", competitor, items: [] };
    }
  }

  private filterRelevantItems(items: SignalItem[], competitors: string[]): SignalItem[] {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    return items.filter(item => {
      // Filter by date - only include articles from last 3 months
      if (item.publishedAt) {
        const publishedDate = new Date(item.publishedAt);
        if (publishedDate < threeMonthsAgo) {
          return false;
        }
      }

      // Enhanced relevance check
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      
      // Check if any competitor is mentioned directly
      const hasCompetitorMention = competitors.some(competitor => {
        const compLower = competitor.toLowerCase();
        return title.includes(compLower) || content.includes(compLower);
      });
      
      if (!hasCompetitorMention) return false;
      
      // Filter out irrelevant topics (exclude loosely related content)
      const irrelevantKeywords = [
        'canva review', 'free ai tools', 'top 9', 'that make your life easier',
        'tutorial', 'how to use', 'tips and tricks', 'vs comparison',
        'alternatives to', 'similar to', 'like', 'instead of'
      ];
      
      const hasIrrelevantContent = irrelevantKeywords.some(keyword => 
        title.includes(keyword) || content.includes(keyword)
      );
      
      if (hasIrrelevantContent) return false;
      
      // Prioritize business-critical content
      const businessKeywords = [
        'funding', 'investment', 'raised', 'revenue', 'earnings', 'valuation',
        'layoffs', 'hiring', 'expansion', 'growth', 'launch', 'acquisition',
        'merger', 'partnership', 'deal', 'ceo', 'executive', 'strategy'
      ];
      
      const hasBusinessContent = businessKeywords.some(keyword => 
        title.includes(keyword) || content.includes(keyword)
      );
      
      // If it mentions the competitor but isn't business-critical, be more selective
      if (!hasBusinessContent && Math.random() > 0.3) {
        return false; // Only include 30% of non-business content
      }
      
      return true;
    });
  }
}

export const signalAggregator = new SignalAggregator();
