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
