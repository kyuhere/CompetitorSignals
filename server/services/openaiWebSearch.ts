import OpenAI from 'openai';

// Local types compatible with existing consumers
export type SignalItem = {
  title: string;
  content: string;
  url?: string;
  publishedAt?: string;
  type: 'news' | 'funding' | 'social' | 'product';
};

export type ReviewSentimentData = {
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
};

type CacheEntry<T> = { data: T; expires: number };

class OpenAIWebSearchService {
  private openai: OpenAI;
  private model: string;
  private ttlMs: number;
  private cacheNews = new Map<string, CacheEntry<SignalItem[]>>();
  private cacheSocial = new Map<string, CacheEntry<ReviewSentimentData | null>>();

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    this.model = process.env.OPENAI_WEB_MODEL || 'gpt-5';
    this.ttlMs = Number(process.env.OPENAI_WEB_CACHE_TTL_MS || 5 * 60 * 1000); // 5 min default for faster updates
  }

  private getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const hit = map.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;
    if (hit) map.delete(key);
    return undefined;
  }

  private setCached<T>(map: Map<string, CacheEntry<T>>, key: string, data: T) {
    map.set(key, { data, expires: Date.now() + this.ttlMs });
  }

  private stripJSON(text: string): string {
    let s = text.trim();
    if (s.startsWith('```')) {
      s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    }
    // Try to find the first JSON object/array
    const firstBrace = s.indexOf('{');
    const firstBracket = s.indexOf('[');
    const start = (firstBrace === -1) ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
    if (start > 0) s = s.slice(start);
    return s;
  }

  private async responsesJSON<T = any>(prompt: string): Promise<T> {
    // Use GPT-4o with system instructions (web search tools may not be available yet)
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o', // Use GPT-4o instead of o1-mini for better compatibility
      messages: [
        {
          role: 'system',
          content: `You are a research assistant that searches for recent news about companies. Focus on finding news from premium tech sources like:
- TechCrunch, Wired, The Verge, Ars Technica, Engadget
- Reuters Technology, Bloomberg Technology, WSJ Tech, Financial Times
- CNBC Technology, Forbes Tech, Business Insider Tech
- VentureBeat, SiliconANGLE, 9to5Mac, MacRumors
- Hacker News, Product Hunt, TechMeme

Return only valid JSON matching the requested schema. No additional text or explanations.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 2000
    });

    const text = response.choices[0]?.message?.content || '';
    const clean = this.stripJSON(text);
    
    try {
      return JSON.parse(clean) as T;
    } catch (e) {
      // Try to extract JSON between first { and last }
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const slice = clean.slice(start, end + 1);
        return JSON.parse(slice) as T;
      }
      throw new Error(`Failed to parse JSON from OpenAI output: ${text}`);
    }
  }

  // Phase 2 news: get recent news items for a competitor
  async searchNewsForCompetitor(competitor: string, intent: 'general' | 'funding' | 'product' | 'partnership' = 'general'): Promise<SignalItem[]> {
    const key = JSON.stringify(['news', competitor, intent]);
    const cached = this.getCached(this.cacheNews, key);
    if (cached) return cached;

    const now = new Date().toISOString().slice(0, 10);
    const jsonSchema = `{
      "items": [
        {"title": "string", "summary": "string", "url": "string", "date": "YYYY-MM-DD or ISO", "category": "news|funding|product|partnership"}
      ]
    }`;

    const currentDate = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const prompt = `Use web search to find the most recent news articles about "${competitor}" from the last 14 days (preferably last 7 days).

Search DIVERSE premium tech news sources. Prioritize different sources for variety:
- TechCrunch, Wired, The Verge, Ars Technica, Engadget
- Reuters Tech, Bloomberg Tech, WSJ Tech, Financial Times
- CNBC Tech, Forbes Tech, Business Insider Tech
- VentureBeat, SiliconANGLE, 9to5Mac, MacRumors
- Hacker News, Product Hunt, TechMeme

Focus on: ${intent === 'general' ? 'business developments, funding, partnerships, product launches, earnings, strategic moves' : intent}

Return ONLY valid JSON matching this exact schema:
${jsonSchema}

Requirements:
- PRIORITIZE articles from the last 7-14 days (${thirtyDaysAgo} to ${currentDate})
- Include 5-8 articles from DIFFERENT sources (avoid duplicates from same domain)
- Use real, working URLs from actual news sources
- Provide accurate publication dates in YYYY-MM-DD format
- Search the web for current, factual information
- Ensure source diversity - no more than 1 article per domain`;

    try {
      const data = await this.responsesJSON<{ items: Array<{ title: string; summary: string; url: string; date?: string; category?: string }> }>(prompt);
      console.log(`[OpenAI] Raw response for ${competitor}:`, JSON.stringify(data, null, 2));
      
      const items: SignalItem[] = (data?.items || []).map((it) => ({
        title: it.title?.trim() || '',
        content: it.summary?.trim() || '',
        url: it.url,
        publishedAt: it.date || now,
        type: (it.category === 'funding' ? 'funding' : it.category === 'product' ? 'product' : 'news') as 'funding' | 'product' | 'news' | 'social',
      })).filter(item => {
        // Filter out articles older than 30 days or from 2023
        if (item.publishedAt) {
          const articleDate = new Date(item.publishedAt);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const year2024 = new Date('2024-01-01');
          if (articleDate < thirtyDaysAgo || articleDate < year2024) {
            console.log(`[OpenAI] Filtering out old article: ${item.title} (${item.publishedAt})`);
            return false;
          }
        }
        return item.title && item.url;
      });

      // Enhanced deduplication with source diversity
      const seen = new Set<string>();
      const seenDomains = new Set<string>();
      const diversified = items.filter(item => {
        // Skip if no URL or title
        if (!item.url || !item.title) return false;
        
        // Skip if duplicate URL or title
        const urlKey = item.url;
        const titleKey = item.title.toLowerCase();
        if (seen.has(urlKey) || seen.has(titleKey)) return false;
        seen.add(urlKey);
        seen.add(titleKey);
        
        // Ensure source diversity - max 1 per domain
        try {
          const domain = new URL(item.url).hostname.replace(/^www\./, '');
          if (seenDomains.has(domain)) return false;
          seenDomains.add(domain);
        } catch {
          // If URL parsing fails, skip this item
          return false;
        }
        
        return true;
      });
      
      // Sort by date (most recent first) and limit
      const sorted = diversified
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, 8);
      
      console.log(`[OpenAI] Returning ${sorted.length} diverse, recent news items for ${competitor}`);
      this.setCached(this.cacheNews, key, sorted);
      return sorted;
    } catch (e) {
      console.error(`[OpenAIWebSearch] Failed to search news for ${competitor} (${intent}):`, e);
      this.setCached(this.cacheNews, key, []);
      return [];
    }
  }

  // Phase 1 enhanced: social sentiment using public sources
  async fetchSocialSentiment(competitor: string, domain?: string | null): Promise<ReviewSentimentData | null> {
    const key = JSON.stringify(['social', competitor, domain || '']);
    const cached = this.getCached(this.cacheSocial, key);
    if (cached !== undefined) return cached;

    const jsonSchema = `{
      "sentiment": "positive|neutral|negative",
      "sentiment_score": 0,
      "total_mentions": 0,
      "summary": "string",
      "quotes": [{"text": "string", "author": "string?", "url": "string?", "rating": 0?}],
      "sources": ["url"]
    }`;

    const scope = domain ? `Focus on ${competitor} (domain: ${domain}).` : `Focus strictly on ${competitor} (avoid name collisions).`;
    const prompt = `What is the public social sentiment of ${competitor}? ${scope}
Use web_search to reference sources like Reddit, G2, Capterra, HN, forums.
Consider roughly the last 6 months. Return STRICT JSON ONLY matching this schema: ${jsonSchema}
No prose. Keep quotes concise and include URLs when possible.`;

    try {
      const data = await this.responsesJSON<{
        sentiment: 'positive' | 'neutral' | 'negative';
        sentiment_score?: number;
        total_mentions?: number;
        summary?: string;
        quotes?: Array<{ text: string; author?: string; url?: string; rating?: number }>;
        sources?: string[];
      }>(prompt);

      const sentiment = ['positive', 'neutral', 'negative'].includes(String(data?.sentiment)) ? (data!.sentiment as any) : 'neutral';
      const score = typeof data?.sentiment_score === 'number' ? Math.max(0, Math.min(100, Math.round(data!.sentiment_score!))) : (sentiment === 'positive' ? 70 : sentiment === 'negative' ? 30 : 50);

      const result: ReviewSentimentData = {
        platform: 'hackernews', // UI expects social sentiment under this key
        sentiment,
        sentimentScore: score,
        totalMentions: typeof data?.total_mentions === 'number' ? data!.total_mentions : undefined,
        topQuotes: (data?.quotes || []).slice(0, 3).map(q => ({ text: q.text, author: q.author, url: q.url, rating: q.rating })),
        summary: (data?.summary || 'Public sentiment summary unavailable').trim(),
      };

      this.setCached(this.cacheSocial, key, result);
      return result;
    } catch (e) {
      console.error('[WebSearch] social sentiment fetch failed', { competitor, domain, error: (e as Error)?.message || e });
      this.setCached(this.cacheSocial, key, null);
      return null;
    }
  }
}

export const openaiWebSearch = new OpenAIWebSearchService();
