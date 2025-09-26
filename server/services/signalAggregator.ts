import { parseRSSFeed } from "./rssParser";
import { openaiWebSearch } from "./openaiWebSearch";

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
    
    const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);
    
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

      // Add RapidAPI news search for each competitor (always as fallback)
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

  // Trim text to headline, summary, and key details only (max 800 chars for better context)
  private trimTextContent(content: string): string {
    if (!content) return '';
    
    // Remove HTML tags
    const cleanContent = content.replace(/<[^>]*>/g, '');
    
    // If content is already reasonably short, return it as-is
    if (cleanContent.length <= 800) {
      return cleanContent.trim();
    }
    
    // For longer content, try to split into sentences more intelligently
    // Handle common abbreviations that shouldn't be split
    const sentences = cleanContent
      .replace(/U\.S\./g, 'US') // Replace U.S. with US to avoid splitting
      .replace(/U\.K\./g, 'UK') // Replace U.K. with UK
      .replace(/etc\./g, 'etc') // Replace etc. with etc
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5); // Filter out very short fragments
    
    let summary = '';
    
    // Build summary by adding sentences until we have good context
    for (let i = 0; i < sentences.length && summary.length < 600; i++) {
      const sentence = sentences[i];
      if (summary) {
        summary += '. ' + sentence;
      } else {
        summary = sentence;
      }
    }
    
    // Restore abbreviations
    summary = summary
      .replace(/\bUS\b/g, 'U.S.')
      .replace(/\bUK\b/g, 'U.K.')
      .replace(/\betc\b/g, 'etc.');
    
    // Limit to 800 characters for better context while maintaining efficiency
    return summary.substring(0, 800).trim();
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

      // Global deduplication across all sources
      const deduplicatedItems = await this.deduplicateAllItems(items);
      
      return {
        source: "Aggregated Sources",
        competitor,
        items: deduplicatedItems.slice(0, 15), // Reduced limit for better quality
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
      // Try OpenAI web search first if enabled
      if (process.env.OPENAI_ENABLE_WEB_NEWS === '1') {
        try {
          const ws = await openaiWebSearch.searchNewsForCompetitor(competitor, 'general');
          if (ws && ws.length > 0) {
            return ws.map(item => ({
              title: item.title || 'No title',
              content: (item as any).snippet || item.title || 'No content',
              url: item.url,
              publishedAt: item.publishedAt,
              type: 'news' as const
            }));
          }
          console.log(`[SignalAggregator] OpenAI web search returned empty for ${competitor}, falling back to RapidAPI`);
        } catch (e) {
          console.error(`[SignalAggregator] OpenAI web search failed for ${competitor}, falling back to RapidAPI:`, e);
        }
        // Fall through to RapidAPI fallback
      }
      // Search for business-critical news about the competitor (reduced queries for speed)
      const searchQueries = [
        `"${competitor}" funding raised investment revenue earnings`,
        `"${competitor}" product launch new features acquisition merger partnership`
      ];

      const allResults: SignalItem[] = [];

      for (const query of searchQueries) {
        try {
          const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(query)}&sortby=date&since=90days&count=3`;
          
          // Add timeout to RSS parsing to prevent hanging
          const rssItems = await Promise.race([
            parseRSSFeed(rssUrl),
            new Promise<any[]>((_, reject) => 
              setTimeout(() => reject(new Error('RSS feed timeout')), 8000)
            )
          ]);
          
          const results = rssItems.map((item: any) => ({
            title: item.title || '',
            content: item.content || '',
            url: item.url || '',
            publishedAt: item.publishedAt || new Date().toISOString(),
            type: this.detectSignalType(query, item.title, item.content) as 'news' | 'funding' | 'social' | 'product',
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
      
      // Enhanced deduplication to prevent duplicate stories
      const uniqueResults = filteredResults.filter((item, index, self) => {
        return index === self.findIndex(t => {
          // Exact URL match - these are definitely duplicates
          if (t.url === item.url && t.url) return true;
          
          // Title similarity check - detect stories about the same event
          const title1Words = t.title.toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .split(/\s+/)
            .filter(w => w.length > 3); // Only significant words
          
          const title2Words = item.title.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3);
          
          if (title1Words.length === 0 || title2Words.length === 0) return false;
          
          // Count common significant words
          const commonWords = title1Words.filter(word => title2Words.includes(word));
          const similarity = commonWords.length / Math.min(title1Words.length, title2Words.length);
          
          // If 60% or more of the shorter title's words match, it's likely the same story
          return similarity >= 0.6;
        });
      });
      
      // Sort by date (newest first) and limit results
      const sortedResults = uniqueResults
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, 5); // Dramatically reduced to prevent duplicates
        
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

  // Global deduplication method to prevent duplicate stories across all sources
  private async deduplicateAllItems(items: SignalItem[]): Promise<SignalItem[]> {
    // First, basic deduplication
    const uniqueItems = items.filter((item, index, self) => {
      return index === self.findIndex(t => {
        // Exact URL match - these are definitely duplicates
        if (t.url === item.url && t.url && t.url.length > 10) return true;
        
        // Title similarity check - detect stories about the same event
        const title1Words = t.title.toLowerCase()
          .replace(/[^\w\s]/g, '') // Remove punctuation
          .split(/\s+/)
          .filter(w => w.length > 3); // Only significant words
        
        const title2Words = item.title.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3);
        
        if (title1Words.length === 0 || title2Words.length === 0) return false;
        
        // Count common significant words
        const commonWords = title1Words.filter(word => title2Words.includes(word));
        const similarity = commonWords.length / Math.min(title1Words.length, title2Words.length);
        
        // If 60% or more of the shorter title's words match, it's likely the same story
        return similarity >= 0.6;
      });
    });

    // AI-powered relevance filtering
    const relevantItems = await this.filterRelevantStories(uniqueItems);

    // Sort by date (newest first) for better quality
    return relevantItems.sort((a, b) => 
      new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    );
  }

  // AI-powered content relevance filtering
  private async filterRelevantStories(items: SignalItem[]): Promise<SignalItem[]> {
    // When web_search is enabled, upstream results are already high-quality. Skip extra AI passes to reduce latency.
    if (process.env.OPENAI_ENABLE_WEB_NEWS === '1') {
      return items;
    }
    if (!process.env.OPENAI_API_KEY || items.length === 0) {
      return items;
    }

    try {
      // Filter out obvious irrelevant stories first
      const preFiltered = items.filter(item => {
        const url = item.url?.toLowerCase() || '';
        const title = item.title?.toLowerCase() || '';
        
        // Filter out stories from the competitor's own website
        if (url.includes('openai.com') || url.includes('chatgpt.com')) return false;
        
        // Filter out generic AI/tech news that mentions multiple companies
        if (title.includes('ai news') || title.includes('tech roundup') || title.includes('weekly digest')) return false;
        
        return true;
      });

      // For remaining items, use AI to check relevance
      const relevantItems: SignalItem[] = [];
      
      for (const item of preFiltered.slice(0, 10)) { // Limit to avoid API costs
        try {
          const isRelevant = await this.checkStoryRelevance(item);
          if (isRelevant) {
            relevantItems.push(item);
          }
        } catch (error) {
          console.error('Error checking story relevance:', error);
          // Include item if AI check fails
          relevantItems.push(item);
        }
      }

      return relevantItems;
    } catch (error) {
      console.error('Error in AI filtering:', error);
      return items; // Return original items if filtering fails
    }
  }

  // Check if a story is actually relevant to competitor analysis
  private async checkStoryRelevance(item: SignalItem): Promise<boolean> {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      });
      
      const prompt = `Analyze this news story and determine if it's relevant for competitor intelligence analysis.

Title: ${item.title}
Content: ${item.content?.substring(0, 500)}

A story is RELEVANT if it contains:
- Specific business developments (funding, partnerships, product launches)
- Market strategy changes or competitive moves
- Financial performance or business metrics
- Leadership changes or organizational updates
- Customer acquisition or market expansion news

A story is NOT RELEVANT if it:
- Is generic AI/tech industry news mentioning multiple companies
- Is about the company's own website, blog posts, or self-promotional content
- Is a roundup/digest mentioning the company briefly
- Is primarily about other companies with just a mention
- Is opinion pieces or general industry commentary

Respond with only "RELEVANT" or "NOT_RELEVANT"`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Fast and cost-effective
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0,
      });

      const result = response.choices[0]?.message?.content?.trim().toUpperCase();
      return result === 'RELEVANT';
    } catch (error) {
      console.error('Error in OpenAI relevance check:', error);
      return true; // Default to including the story if check fails
    }
  }

  private async getFundingSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Try OpenAI web search first if enabled
      if (process.env.OPENAI_ENABLE_WEB_NEWS === '1') {
        try {
          const ws = await openaiWebSearch.searchNewsForCompetitor(competitor, 'funding');
          if (ws && ws.length > 0) {
            return ws.map(item => ({
              title: item.title || 'No title',
              content: (item as any).snippet || item.title || 'No content',
              url: item.url,
              publishedAt: item.publishedAt,
              type: 'funding' as const
            }));
          }
          console.log(`[SignalAggregator] OpenAI web search returned empty for ${competitor} funding, falling back to RapidAPI`);
        } catch (e) {
          console.error(`[SignalAggregator] OpenAI web search failed for ${competitor} funding, falling back to RapidAPI:`, e);
        }
        // Fall through to RapidAPI fallback
      }
      const fundingQuery = `"${competitor}" "funding" OR "investment" OR "raised" OR "revenue" OR "valuation" OR "IPO"`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(fundingQuery)}&sortby=date&since=90days&count=5`;
      const rssItems = await parseRSSFeed(rssUrl);
      
      return rssItems.map((item: any) => ({
        title: item.title || '',
        content: item.content || '',
        url: item.url || '',
        publishedAt: item.publishedAt || new Date().toISOString(),
        type: 'funding' as const,
      })).slice(0, 5);
    } catch (error) {
      console.error("Error fetching funding signals:", error);
      return [];
    }
  }

  private async getSocialSignals(competitor: string): Promise<SignalItem[]> {
    try {
      // Try OpenAI web search first if enabled
      if (process.env.OPENAI_ENABLE_WEB_NEWS === '1') {
        try {
          const ws = await openaiWebSearch.searchNewsForCompetitor(competitor, 'general');
          if (ws && ws.length > 0) {
            return ws.map(item => ({
              title: item.title || 'No title',
              content: (item as any).snippet || item.title || 'No content',
              url: item.url,
              publishedAt: item.publishedAt,
              type: 'social' as const
            }));
          }
          console.log(`[SignalAggregator] OpenAI web search returned empty for ${competitor} social, falling back to RapidAPI`);
        } catch (e) {
          console.error(`[SignalAggregator] OpenAI web search failed for ${competitor} social, falling back to RapidAPI:`, e);
        }
        // Fall through to RapidAPI fallback
      }
      const socialQuery = `"${competitor}" "customers" OR "reviews" OR "complaints" OR "satisfaction" OR "market share"`;
      const rssUrl = `https://www.bing.com/news/search?format=RSS&q=${encodeURIComponent(socialQuery)}&sortby=date&since=90days&count=5`;
      const rssItems = await parseRSSFeed(rssUrl);
      
      return rssItems.map((item: any) => ({
        title: item.title || '',
        content: item.content || '',
        url: item.url || '',
        publishedAt: item.publishedAt || new Date().toISOString(),
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
      // If web_search is enabled, use OpenAI Responses to retrieve high-quality links here
      if (process.env.OPENAI_ENABLE_WEB_NEWS === '1') {
        try {
          const ws = await openaiWebSearch.searchNewsForCompetitor(competitor, 'general');
          return {
            source: "RapidAPI News",
            competitor,
            items: (ws || []).slice(0, 8)
          };
        } catch (e) {
          console.error('[RapidAPI News] web_search path failed, falling back to RapidAPI', { competitor, error: (e as Error)?.message });
        }
      }

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

// ...
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
