import { parseRSSFeed } from './rssParser';
import { openaiWebSearch } from './openaiWebSearch';

interface NewsItem {
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  source: string;
  type: 'news' | 'funding' | 'product' | 'social';
}

class PremiumNewsService {
  private premiumRSSFeeds = [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Reuters Tech', url: 'https://feeds.reuters.com/reuters/technologyNews' },
    { name: 'Bloomberg Tech', url: 'https://feeds.bloomberg.com/technology/news.rss' },
    { name: 'CNBC Tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
    { name: 'Forbes Tech', url: 'https://www.forbes.com/innovation/feed2/' },
    { name: 'Business Insider Tech', url: 'https://feeds.businessinsider.com/typepad/alleyinsider/silicon_alley_insider' },
    { name: 'VentureBeat', url: 'https://venturebeat.com/feed/' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' }
  ];

  private cache = new Map<string, { data: NewsItem[]; expires: number }>();
  private ttlMs = 10 * 60 * 1000; // 10 minutes

  private getCached(key: string): NewsItem[] | undefined {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;
    if (hit) this.cache.delete(key);
    return undefined;
  }

  private setCached(key: string, data: NewsItem[]) {
    this.cache.set(key, { data, expires: Date.now() + this.ttlMs });
  }

  async searchNews(competitor: string, maxResults = 12): Promise<NewsItem[]> {
    const cacheKey = `news-${competitor}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const results: NewsItem[] = [];

    try {
      // First, try OpenAI web search for high-quality, targeted results
      console.log(`[PremiumNews] Searching OpenAI for ${competitor}...`);
      const openaiResults = await openaiWebSearch.searchNewsForCompetitor(competitor, 'general');
      
      if (openaiResults && openaiResults.length > 0) {
        results.push(...openaiResults.map(item => ({
          title: item.title,
          content: item.content,
          url: item.url || '',
          publishedAt: item.publishedAt || new Date().toISOString(),
          source: 'OpenAI Search',
          type: item.type
        })));
        console.log(`[PremiumNews] Found ${openaiResults.length} items from OpenAI`);
      }
    } catch (error) {
      console.error(`[PremiumNews] OpenAI search failed for ${competitor}:`, error);
    }

    // If we don't have enough results, supplement with RSS feeds
    if (results.length < maxResults / 2) {
      console.log(`[PremiumNews] Supplementing with RSS feeds for ${competitor}...`);
      
      // Process RSS feeds in parallel but limit concurrency
      const rssPromises = this.premiumRSSFeeds.slice(0, 6).map(async (feed) => {
        try {
          const items = await parseRSSFeed(feed.url);
          return items
            .filter(item => this.isRelevantToCompetitor(item, competitor))
            .slice(0, 2) // Limit per feed
            .map(item => ({
              title: item.title,
              content: item.content,
              url: item.url || '',
              publishedAt: item.publishedAt || new Date().toISOString(),
              source: feed.name,
              type: item.type
            }));
        } catch (error) {
          console.error(`[PremiumNews] Failed to fetch ${feed.name}:`, error);
          return [];
        }
      });

      const rssResults = await Promise.allSettled(rssPromises);
      const rssItems = rssResults
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => (result as PromiseFulfilledResult<NewsItem[]>).value);

      results.push(...rssItems);
      console.log(`[PremiumNews] Found ${rssItems.length} additional items from RSS`);
    }

    // Deduplicate and sort
    const deduped = this.deduplicateNews(results);
    const sorted = deduped
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, maxResults);

    this.setCached(cacheKey, sorted);
    console.log(`[PremiumNews] Returning ${sorted.length} total items for ${competitor}`);
    return sorted;
  }

  private isRelevantToCompetitor(item: any, competitor: string): boolean {
    const text = `${item.title} ${item.content}`.toLowerCase();
    const compLower = competitor.toLowerCase();
    
    // Check for exact company name match
    if (text.includes(compLower)) return true;
    
    // For common companies, check for variations
    const variations: Record<string, string[]> = {
      'apple': ['iphone', 'ipad', 'mac', 'ios', 'macos', 'tim cook'],
      'google': ['alphabet', 'android', 'chrome', 'youtube', 'gmail', 'sundar pichai'],
      'microsoft': ['windows', 'office', 'azure', 'xbox', 'teams', 'satya nadella'],
      'meta': ['facebook', 'instagram', 'whatsapp', 'mark zuckerberg'],
      'amazon': ['aws', 'alexa', 'prime', 'jeff bezos', 'andy jassy'],
      'openai': ['chatgpt', 'gpt-4', 'sam altman'],
      'tesla': ['elon musk', 'model s', 'model 3', 'model y', 'cybertruck'],
      'nvidia': ['gpu', 'cuda', 'jensen huang', 'geforce', 'rtx']
    };

    const compVariations = variations[compLower] || [];
    return compVariations.some(variation => text.includes(variation));
  }

  private deduplicateNews(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      // Create a key based on URL or title similarity
      const urlKey = item.url ? new URL(item.url).pathname : '';
      const titleKey = item.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const key = urlKey || titleKey;
      
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const premiumNewsService = new PremiumNewsService();
