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
    this.ttlMs = Number(process.env.OPENAI_WEB_CACHE_TTL_MS || 10 * 60 * 1000); // 10 min default
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
    const resp = await this.openai.responses.create({
      model: this.model as any,
      input: prompt as any,
      tools: [{ type: 'web_search' } as any],
      reasoning: { effort: 'high' } as any,
      temperature: 0.2,
    } as any);

    const text = (resp as any).output_text
      || (resp as any).output?.[0]?.content?.[0]?.text?.value
      || (resp as any).choices?.[0]?.message?.content
      || '';

    const clean = this.stripJSON(String(text));
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
      throw new Error(`Failed to parse JSON from Responses output: ${text}`);
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

    const prompt = `You are a research assistant. Use web_search to find the most recent, high-signal items about "${competitor}".
Focus on the last 90 days. Prioritize ${intent === 'general' ? 'business-critical news' : intent}.
Return STRICT JSON ONLY matching this schema: ${jsonSchema}
No prose. Include 3–6 items maximum. Avoid duplicates and low-signal content.`;

    try {
      const data = await this.responsesJSON<{ items: Array<{ title: string; summary: string; url: string; date?: string; category?: string }> }>(prompt);
      const items: SignalItem[] = (data?.items || []).map((it) => ({
        title: it.title?.trim() || '',
        content: it.summary?.trim() || '',
        url: it.url,
        publishedAt: it.date || now,
        type: (it.category as any) === 'funding' ? 'funding' : (it.category as any) === 'product' ? 'product' : 'news',
      }));

      // Basic cleanup
      const dedup = items.filter((item, idx, self) => idx === self.findIndex(t => (t.url && t.url === item.url) || t.title === item.title));
      const limited = dedup.slice(0, 6);
      this.setCached(this.cacheNews, key, limited);
      return limited;
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
