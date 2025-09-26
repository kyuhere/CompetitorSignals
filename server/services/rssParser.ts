interface RSSItem {
  title: string;
  content: string;
  url?: string;
  publishedAt?: string;
  type: 'news' | 'funding' | 'social' | 'product';
}

export async function parseRSSFeed(url: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AI-Competitor-Signals/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }

    const text = await response.text();
    const items = parseXMLToItems(text);
    
    return items.map(item => ({
      ...item,
      url: item.url ? normalizeRssLink(item.url) : item.url,
      type: detectItemType(item.title, item.content),
    }));
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error);
    throw error;
  }
}

function parseXMLToItems(xmlText: string): Omit<RSSItem, 'type'>[] {
  try {
    // Simple XML parsing for RSS feeds
    const items: Omit<RSSItem, 'type'>[] = [];
    
    // Extract items using regex (basic implementation)
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title[^>]*>([\s\S]*?)<\/title>/i;
    const descRegex = /<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description[^>]*>([\s\S]*?)<\/description>/i;
    const linkRegex = /<link[^>]*>([\s\S]*?)<\/link>/i;
    const pubDateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;

    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      
      const titleMatch = titleRegex.exec(itemXml);
      const descMatch = descRegex.exec(itemXml);
      const linkMatch = linkRegex.exec(itemXml);
      const pubDateMatch = pubDateRegex.exec(itemXml);
      
      const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
      const content = (descMatch?.[1] || descMatch?.[2] || '').trim();
      const url = linkMatch?.[1]?.trim();
      const publishedAt = pubDateMatch?.[1]?.trim();
      
      if (title && content) {
        items.push({
          title: cleanHtml(title),
          content: cleanHtml(content),
          url,
          publishedAt,
        });
      }
    }
    
    return items;
  } catch (error) {
    console.error("Error parsing XML:", error);
    return [];
  }
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRssLink(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();

    // Handle Bing News click-through links
    if (host.includes('bing.com')) {
      // apiclick path usually has original url in `url` parameter
      const cand = u.searchParams.get('url') || u.searchParams.get('u') || '';
      if (cand) {
        // Try decodeURIComponent first
        let decoded = '';
        try { decoded = decodeURIComponent(cand); } catch { decoded = cand; }

        // Some variants use base64 for `u`
        if (!/^https?:\/\//i.test(decoded) && /^[A-Za-z0-9+/=_-]+$/.test(decoded)) {
          try {
            const base = decoded.replace(/-/g, '+').replace(/_/g, '/');
            const buf = Buffer.from(base, 'base64');
            const text = buf.toString('utf8');
            if (/^https?:\/\//i.test(text)) decoded = text;
          } catch {}
        }

        if (/^https?:\/\//i.test(decoded)) return decoded;
      }

      // Sometimes the path contains a redirect-like "ck/a" with encoded target in the query
      const r = u.searchParams.get('r');
      if (r && /^https?:\/\//i.test(r)) return r;
    }

    // Handle Google News style links if ever encountered (defensive)
    if (host.includes('news.google.') || host.includes('news.url.google.')) {
      const gu = u.searchParams.get('url');
      if (gu && /^https?:\/\//i.test(gu)) return gu;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function detectItemType(title: string, content: string): 'news' | 'funding' | 'social' | 'product' {
  const text = (title + ' ' + content).toLowerCase();
  
  if (text.includes('funding') || text.includes('investment') || text.includes('round') || text.includes('raised')) {
    return 'funding';
  }
  
  if (text.includes('launch') || text.includes('release') || text.includes('feature') || text.includes('product')) {
    return 'product';
  }
  
  if (text.includes('twitter') || text.includes('social') || text.includes('tweet')) {
    return 'social';
  }
  
  return 'news';
}
