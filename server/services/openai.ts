import OpenAI from "openai";

// Optimized for speed - using GPT-4o-mini for fast processing, GPT-4o for premium
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

// Model selection based on use case
const FAST_MODEL = "gpt-4o-mini"; // For quick categorization and summarization
const PREMIUM_MODEL = "gpt-4o"; // For deeper analysis

interface CompetitorSignal {
  source: string;
  competitor: string;
  items: Array<{
    title: string;
    content: string;
    url?: string;
    publishedAt?: string;
    type: 'news' | 'funding' | 'social' | 'product';
  }>;
}

// Full structured analysis (used by summarizeCompetitorSignals)
interface FullCompanyOverview {
  location?: string;
  market_positioning?: string;
  key_products_services?: string[] | string;
}

interface FullStrengthsWeaknesses {
  strengths?: string[];
  weaknesses?: string[];
}

interface FullCompetitorAnalysis {
  competitor: string;
  company_overview?: FullCompanyOverview;
  strengths_weaknesses?: FullStrengthsWeaknesses;
  pricing_strategy?: Record<string, any>;
  target_market?: Record<string, any>;
  tech_assessment?: Record<string, any>;
  market_presence?: Record<string, any>;
  products_services?: Record<string, any>;
  swot_analysis?: Record<string, any>;
  customer_insights?: Record<string, any>;
  tech_innovation?: Record<string, any>;
  activity_level?: 'high' | 'moderate' | 'low';
  recent_developments?: string[];
  funding_business?: string[];
}

interface FullAnalysisResult {
  executive_summary: string;
  competitors: FullCompetitorAnalysis[];
  key_takeaways?: string[];
  strategic_insights?: string[];
  sources_referenced?: string;
  methodology?: {
    sources_analyzed?: string[];
    total_signals?: number;
    confidence_level?: 'high' | 'medium' | 'low';
  };
}

// Newsletter-style digest (Markdown output) — fast, concise, email-ready
export async function summarizeNewsletterDigest(input: {
  trackedCompanies: Array<{ canonicalName: string; aliases?: string[] }>,
  history: Record<string, {
    developments?: string[];
    funding?: string[];
    market?: string[];
    tech?: string[];
  }>,
  fresh: Record<string, {
    developments?: string[];
    funding?: string[];
    market?: string[];
    tech?: string[];
  }>,
  period: { from: string; to: string }
}): Promise<string> {
  const { trackedCompanies, history, fresh, period } = input;
  try {
    const prompt = `
Purpose:
Create a fast, email-ready “newsletter” summary for up to 10 tracked competitors.
This is NOT a mini full report. Keep it concise and scannable.

INPUT (structured JSON):
trackedCompanies: ${JSON.stringify(trackedCompanies)}
history: ${JSON.stringify(history)}
fresh: ${JSON.stringify(fresh)}
period: ${JSON.stringify(period)}

Critical rules (reflect real app constraints):
- STRICTLY include only companies from trackedCompanies.
- Normalize names: use canonicalName when displaying; map any alias to canonical.
- Deduplicate facts within and across sections; do not repeat the same update twice.
- Prioritize “fresh” items within the given period; if none, pull 1 strong recent item from history (<= 90 days) and mark “(earlier)”.
- Omit reviews/public sentiment entirely.
- If a company has no material updates for a section, omit that company from that section (do not add filler).
- Sort companies by the order of trackedCompanies.
- Keep output short, deterministic, and fast to render.

Output format (email-friendly Markdown ONLY). Use EXACT section titles:

**Executive Summary**
- 1–2 short paragraphs that synthesize overall changes across all companies.
- Blend fresh + historic context; do not repeat bullets verbatim.

**Recent Developments**
- **Company A**: bullet 1. bullet 2.

**Funding & Business Changes**
- **Company A**: bullet 1. bullet 2.

**Market Trends**
- **Company A**: bullet 1. bullet 2.

**Technology & Innovation**
- **Company A**: bullet 1. bullet 2.

**Strategic Insights**
- Cross-company insight 1.
- Cross-company insight 2.
- Cross-company insight 3. (3–5 total)

Stylistic constraints:
- Max 2 bullets per company per section; each bullet ≤ ~20–25 words.
- Bold company names exactly as **Company** at the start of each line.
- No extra sections, no closing remarks.
- Focus on signal over noise; use plain, neutral, professional language.
- No invented companies; no invented facts.

Validation:
- Ensure no duplicate “Strategic Insights” block (render once at the end).
- Ensure every company mentioned appears in trackedCompanies and uses its canonicalName.

Output only the formatted Markdown newsletter (no JSON, no preamble).
`;

    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: "system", content: "You produce concise, accurate newsletters in Markdown. Follow constraints exactly. Output Markdown only." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1600,
      temperature: 0.2
    });

    const md = response.choices?.[0]?.message?.content || '';
    if (!md) throw new Error('No newsletter content generated');
    return md;
  } catch (err) {
    console.error('OpenAI newsletter digest error:', err);
    throw new Error(`Failed to generate newsletter digest: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// Compact full-structure analysis (2-3 bullets per section) for speed but tab-friendly rendering
export async function summarizeCompactSignals(
  signals: CompetitorSignal[],
  competitorNames: string[]
): Promise<string> {
  try {
    const trimmedSignals = signals.map(signal => ({
      source: signal.source,
      competitor: signal.competitor,
      items: signal.items.slice(0, 3)
    }));

    const prompt = `
You are an expert competitive intelligence analyst. Analyze the following competitor signals and produce a COMPACT, FULL-STRUCTURE report in JSON with 2-3 bullet points per section per competitor.

COMPETITOR NAMES: ${competitorNames.join(', ')}

SIGNALS DATA:
${JSON.stringify(trimmedSignals, null, 2)}

Return JSON only with the structure below. Keep bullets concise (max ~18 words). If data is missing, use "No reliable data found".
{
  "executive_summary": "2-3 short sentences",
  "competitors": [
    {
      "competitor": "Company Name",
      "company_overview": {
        "location": "..." ,
        "market_positioning": "...",
        "key_products_services": ["• ...", "• ..."]
      },
      "strengths_weaknesses": {
        "strengths": ["• ...", "• ...", "• ..."],
        "weaknesses": ["• ...", "• ...", "• ..."]
      },
      "pricing_strategy": {
        "pricing_models": "...",
        "general_strategy": "...",
        "promotions_offers": "..."
      },
      "target_market": {
        "primary_segments": "...",
        "competitive_position": "..."
      },
      "tech_assessment": {
        "tech_stack": "...",
        "innovation_level": "..."
      },
      "market_presence": {
        "market_share": "...",
        "geographic_reach": "...",
        "target_audience": "..."
      },
      "products_services": {
        "main_offerings": ["• ...", "• ..."],
        "unique_selling_points": ["• ...", "• ..."]
      },
      "swot_analysis": {
        "strengths": ["• ...", "• ..."],
        "weaknesses": ["• ...", "• ..."],
        "opportunities": ["• ...", "• ..."],
        "threats": ["• ...", "• ..."]
      },
      "customer_insights": {
        "sentiment": "...",
        "pain_points": ["• ...", "• ..."]
      },
      "tech_innovation": {
        "patents_rd": "...",
        "differentiating_innovations": "..."
      },
      "activity_level": "high|moderate|low",
      "recent_developments": ["• ...", "• ...", "• ..."],
      "funding_business": ["• ...", "• ...", "• ..."]
    }
  ],
  "strategic_insights": ["• ...", "• ...", "• ..."],
  "methodology": {
    "sources_analyzed": ["Bing News RSS", "Funding News", "Social Media"],
    "total_signals": ${signals.reduce((acc, s) => acc + s.items.length, 0)},
    "confidence_level": "high|medium|low"
  }
}`;

    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: "system", content: "You are an expert competitive intelligence analyst. Output compact, accurate, and structured JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1800,
      temperature: 0.3
    });

    const result = response.choices[0].message.content || '{}';
    // Validate JSON
    JSON.parse(result);
    return result;
  } catch (error) {
    console.error("OpenAI compact summarization error:", error);
    throw new Error(`Failed to generate compact analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

interface CompetitorSummary {
  competitor: string;
  activity_level: 'high' | 'moderate' | 'low';
  recent_developments: string[];
  funding_business: string[];
  social_sentiment: {
    score: number; // 0-100
    mentions_count: number;
    quotes?: string[];
  };
  key_insights: string[];
}

interface AnalysisResult {
  executive_summary: string;
  competitors: CompetitorSummary[];
  strategic_insights: string[];
  methodology: {
    sources_analyzed: string[];
    total_signals: number;
    confidence_level: 'high' | 'medium' | 'low';
  };
}

// Fast preview analysis for immediate results
export async function generateFastPreview(
  signals: CompetitorSignal[],
  competitorNames: string[]
): Promise<string> {
  try {
    // Create a smaller prompt focused on key insights only
    const trimmedSignals = signals.map(signal => ({
      source: signal.source,
      competitor: signal.competitor,
      items: signal.items.slice(0, 3) // Only first 3 items for speed
    }));

    const prompt = `
Analyze these competitor signals and provide a BRIEF executive summary in JSON format.

COMPETITORS: ${competitorNames.join(', ')}
SIGNALS: ${JSON.stringify(trimmedSignals)}

Respond with JSON only:
{
  "executive_summary": "Brief 2-3 sentence overview",
  "competitor_insights": [
    {"competitor": "Name", "activity_level": "high|moderate|low", "key_update": "One key development"}
  ],
  "top_signals": ["Most important finding 1", "Most important finding 2"]
}`;

    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800, // Keep it small for speed
      temperature: 0.3
    });

    return response.choices[0].message.content || '{}';
  } catch (error) {
    console.error("Error generating fast preview:", error);
    throw new Error("Failed to generate preview analysis");
  }
}

// Full analysis with premium model
export async function summarizeCompetitorSignals(
  signals: CompetitorSignal[],
  competitorNames: string[],
  usePremium: boolean = false
): Promise<string> {
  try {
    const prompt = `
You are an expert competitive intelligence analyst. Analyze the following competitor signals and generate a comprehensive competitive intelligence report.

COMPETITOR NAMES: ${competitorNames.join(', ')}

SIGNALS DATA:
${JSON.stringify(signals, null, 2)}

Please generate a comprehensive competitive intelligence analysis with structured, detailed sections for each competitor using the following JSON structure:

{
  "executive_summary": "• Brief overview of competitive landscape\n• Key market trends and developments\n• Overall activity assessment",
  "competitors": [
    {
      "competitor": "Company Name",
      "company_overview": {
        "location": "Headquarters location or 'No reliable data found'",
        "market_positioning": "Market position description or 'No reliable data found'",
        "key_products_services": ["• Product/service 1", "• Product/service 2"] || "No reliable data found"
      },
      "strengths_weaknesses": {
        "strengths": [
          "• Strength 1 [Source: example.com](https://example.com/article)",
          "• Strength 2 [Source: example.com](https://example.com/article)",
          "• Strength 3 [Source: example.com](https://example.com/article)",
          "• Strength 4 [Source: example.com](https://example.com/article)",
          "• Strength 5 [Source: example.com](https://example.com/article)"
        ],
        "weaknesses": [
          "• Weakness 1 [Source: example.com](https://example.com/article)",
          "• Weakness 2 [Source: example.com](https://example.com/article)",
          "• Weakness 3 [Source: example.com](https://example.com/article)",
          "• Weakness 4 [Source: example.com](https://example.com/article)",
          "• Weakness 5 [Source: example.com](https://example.com/article)"
        ]
      },
      "pricing_strategy": {
        "pricing_models": "Subscription/One-time/Tiered/Freemium or 'No reliable data found'",
        "general_strategy": "Premium/Low-cost/Freemium/Competitive or 'No reliable data found'",
        "promotions_offers": "Current promotions or 'No reliable data found'"
      },
      "target_market": {
        "primary_segments": "Customer segments or 'No reliable data found'",
        "competitive_position": "Positioning vs competitors or 'No reliable data found'"
      },
      "tech_assessment": {
        "tech_stack": "Frontend/backend/frameworks or 'No reliable data found'",
        "innovation_level": "Traditional/Modern/Cutting-edge or 'No reliable data found'"
      },
      "market_presence": {
        "market_share": "Estimated % or 'No reliable data found'",
        "geographic_reach": "Regions/countries or 'No reliable data found'",
        "target_audience": "Audience description or 'No reliable data found'"
      },
      "products_services": {
        "main_offerings": ["• Offering 1", "• Offering 2"] || "No reliable data found",
        "unique_selling_points": ["• USP 1", "• USP 2"] || "No reliable data found"
      },
      "swot_analysis": {
        "strengths": ["• Strength 1", "• Strength 2"],
        "weaknesses": ["• Weakness 1", "• Weakness 2"],
        "opportunities": ["• Opportunity 1", "• Opportunity 2"],
        "threats": ["• Threat 1", "• Threat 2"]
      },
      "customer_insights": {
        "sentiment": "Positive/Neutral/Negative or 'No reliable data found'",
        "pain_points": ["• Pain point 1", "• Pain point 2"] || "No reliable data found"
      },
      "tech_innovation": {
        "patents_rd": "Notable patents/R&D or 'No reliable data found'",
        "differentiating_innovations": "Key innovations or 'No reliable data found'"
      },
      "activity_level": "high|moderate|low",
      "recent_developments": [
        "• Recent product launch or update with market impact [Source: example.com](https://example.com/article)",
        "• Partnership announcements and strategic moves [Source: example.com](https://example.com/article)",
        "• Executive changes or organizational updates [Source: example.com](https://example.com/article)"
      ],
      "funding_business": [
        "• Funding rounds with amounts and investors [Source: example.com](https://example.com/article)",
        "• Business expansion or market entry news [Source: example.com](https://example.com/article)",
        "• Revenue or growth announcements [Source: example.com](https://example.com/article)"
      ]
    }
  ],
  "key_takeaways": [
    "• Key takeaway 1: Most important finding for your business [Source: example.com](https://example.com/article)",
    "• Key takeaway 2: Competitor strategy change to monitor [Source: example.com](https://example.com/article)",
    "• Key takeaway 3: Market opportunity to capitalize on [Source: example.com](https://example.com/article)",
    "• Key takeaway 4: Threat or challenge to address [Source: example.com](https://example.com/article)",
    "• Key takeaway 5: Innovation or trend to watch [Source: example.com](https://example.com/article)",
    "• Key takeaway 6: Partnership or alliance development [Source: example.com](https://example.com/article)",
    "• Key takeaway 7: Pricing or positioning insight [Source: example.com](https://example.com/article)",
    "• Key takeaway 8: Customer sentiment or feedback trend [Source: example.com](https://example.com/article)",
    "• Key takeaway 9: Technology or product advancement [Source: example.com](https://example.com/article)",
    "• Key takeaway 10: Funding or investment activity [Source: example.com](https://example.com/article)",
    "• Key takeaway 11: Market expansion or entry news [Source: example.com](https://example.com/article)",
    "• Key takeaway 12: Leadership or organizational change [Source: example.com](https://example.com/article)",
    "• Key takeaway 13: Regulatory or industry development [Source: example.com](https://example.com/article)",
    "• Key takeaway 14: Strategic weakness to exploit [Source: example.com](https://example.com/article)",
    "• Key takeaway 15: Future outlook or prediction [Source: example.com](https://example.com/article)"
  ],
  "strategic_insights": [
    "• Cross-competitor trend 1 with market implications [Source: example.com](https://example.com/article)",
    "• Industry development 2 affecting competitive landscape [Source: example.com](https://example.com/article)",
    "• Strategic opportunity or threat 3 for consideration [Source: example.com](https://example.com/article)"
  ],
  "sources_referenced": "Brief summary of news articles, funding announcements, social mentions, and other sources analyzed",
  "methodology": {
    "sources_analyzed": ["Bing News RSS", "Funding News", "Social Media"],
    "total_signals": ${signals.reduce((acc, s) => acc + s.items.length, 0)},
    "confidence_level": "high|medium|low"
  }
}

CRITICAL FORMATTING REQUIREMENTS:
- Output must be structured in clear, labeled sections as specified above
- Use bullet points wherever possible (• symbol)
- If data is missing for any section, clearly note: "No reliable data found"
- Keep language concise and business-professional (newsletter/report style)
- Each competitor must include ALL sections: company_overview, strengths_weaknesses, pricing_strategy, target_market, tech_assessment, market_presence, products_services, swot_analysis, customer_insights, and tech_innovation
- For strengths_weaknesses: provide exactly 5 bullet points for strengths and 5 for weaknesses
- For SWOT analysis: provide at least 2 points for each category (strengths, weaknesses, opportunities, threats)
- Append Markdown source links using the item's URL from SIGNALS DATA when available, formatted as [Source: domain](URL) (e.g., [Source: wsj.com](https://www.wsj.com/...)). Use the actual publisher domain, not bing.com/news.
- You MUST derive sources from the provided SIGNALS DATA items' url fields. Never use generic placeholders like "[Source: news]" or "[Source: bing.com/news]".
- If multiple items support the same point, choose one representative, recent source.
- Recent developments (last 30 days prioritized)
- Business impact and strategic implications
- Rate activity level based on signal volume and recency
- If an item's URL is missing, omit the link; do not invent URLs. Keep link labels short (domain only).
- For basic facts (e.g., company headquarters location) that are widely known and unambiguous, you may include them from general knowledge if not explicitly present in SIGNALS DATA; otherwise output "No reliable data found".
- IMPORTANT: Always populate ALL sections for each competitor even if data is limited
- If specific data is not available, provide reasonable business estimates or note "No reliable data found"
- Do NOT leave any section empty or undefined
`;

    const response = await openai.chat.completions.create({
      model: usePremium ? PREMIUM_MODEL : FAST_MODEL, // Use fast model by default, premium for deeper analysis
      messages: [
        {
          role: "system",
          content: "You are an expert competitive intelligence analyst with deep experience in market research and business strategy. Provide accurate, actionable insights based on the provided data."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = response.choices[0].message.content;
    if (!result) {
      throw new Error("No response from OpenAI");
    }

    // Validate and post-process the JSON response
    const analysis: FullAnalysisResult = JSON.parse(result);

    // Helper to extract domain from a URL
    const domainFromUrl = (u?: string): string | null => {
      if (!u) return null;
      try {
        const url = new URL(u);
        return url.hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    };

    // Basic fallback HQ facts for common companies (to avoid "No reliable data found")
    const BASIC_LOCATIONS: Record<string, string> = {
      'OpenAI': 'San Francisco, USA',
    };

    // Build quick index of signals by competitor and by type
    const sigIndex: Record<string, { any: typeof signals[0]['items']; funding: typeof signals[0]['items']; news: typeof signals[0]['items'] }> = {};
    for (const s of signals) {
      const arrAny = s.items || [];
      const arrFunding = arrAny.filter(it => it.type === 'funding');
      const arrNews = arrAny.filter(it => it.type !== 'funding');
      sigIndex[s.competitor] = { any: arrAny, funding: arrFunding, news: arrNews };
    }

    // Ensure bullets carry a source link when possible; strip placeholder tokens
    const appendSourceIfMissing = (text: string, url?: string): string => {
      if (!text) return text;
      const cleaned = text
        .replace(/\[Source:\s*(?:news|bing\.com\/news)\s*\]/ig, '')
        .replace(/\(https?:\/\/bing\.com\/news[^\)]*\)/ig, '');
      // Remove placeholder source tags without URLs, e.g., [Source: Your Source Here]
      let cleaned2 = cleaned.replace(/\[Source:\s*([^\]]*?)\](?!\([^\)]*\))/ig, '');
      // Normalize any existing Markdown links to use domain-only labels
      cleaned2 = cleaned2.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, (_m, _label: string, link: string) => {
        const dd = domainFromUrl(link) || _label;
        return `[${dd}](${link})`;
      });

      // If there are any bare URLs, convert them to Markdown links with domain label
      if (!/\[[^\]]+\]\([^\)]+\)/.test(cleaned2)) {
        cleaned2 = cleaned2.replace(/https?:\/\/[^\s\)]+/g, (u) => {
          const dd = domainFromUrl(u) || 'link';
          return `[${dd}](${u})`;
        });
      }
      const hasLink = /\[[^\]]+\]\([^\)]+\)/i.test(cleaned2);
      const d = domainFromUrl(url || '');
      if (hasLink || !d || !url) return cleaned2.trim();
      return `${cleaned2.trim()} [${d}](${url})`;
    };

    for (const comp of analysis.competitors) {
      // Fill HQ if missing and we have a known value
      const knownLoc = BASIC_LOCATIONS[comp.competitor] || BASIC_LOCATIONS[comp.competitor?.trim()] || null;
      if (comp.company_overview && (!comp.company_overview.location || /no reliable data found/i.test(String(comp.company_overview.location)))) {
        if (knownLoc) {
          comp.company_overview.location = knownLoc;
        }
      }

      const idx = sigIndex[comp.competitor] || sigIndex[comp.competitor?.trim()] || { any: [], funding: [], news: [] };
      const pickUrl = (pref: 'funding' | 'news' | 'any') => {
        const arr = idx[pref] || [];
        const candidates = (arr as any[]).map(it => it?.url).filter(Boolean) as string[];
        const isArticleLike = (u: string) => {
          try {
            const x = new URL(u);
            if (!/^https?:$/i.test(x.protocol)) return false;
            if (/bing\.com\/news/i.test(x.hostname + x.pathname)) return false;
            // Prefer non-homepage paths with slugs or dates
            const p = x.pathname || '/';
            if (p === '/' || p.length < 3) return false;
            // Heuristics: hyphens or multiple segments imply article pages
            const segs = p.split('/').filter(Boolean);
            return segs.length >= 2 || /\d{4}/.test(p) || /-/.test(p);
          } catch { return false; }
        };
        const article = candidates.find(isArticleLike);
        if (article) return article;
        // fallback: any non-empty URL
        return candidates.find(u => (u || '').length > 10);
      };

      // Recent developments: prefer news-type URLs
      if (Array.isArray(comp.recent_developments)) {
        const url = pickUrl('news') || pickUrl('any');
        comp.recent_developments = comp.recent_developments.map(b => appendSourceIfMissing(b, url));
      }
      // Funding/business: prefer funding URLs
      if (Array.isArray(comp.funding_business)) {
        const url = pickUrl('funding') || pickUrl('news') || pickUrl('any');
        comp.funding_business = comp.funding_business.map(b => appendSourceIfMissing(b, url));
      }

      // Strengths/Weaknesses bullets: prefer news-type URLs
      if (comp.strengths_weaknesses) {
        const url = pickUrl('news') || pickUrl('any');
        if (Array.isArray(comp.strengths_weaknesses.strengths)) {
          comp.strengths_weaknesses.strengths = comp.strengths_weaknesses.strengths.map(b => appendSourceIfMissing(b, url));
        }
        if (Array.isArray(comp.strengths_weaknesses.weaknesses)) {
          comp.strengths_weaknesses.weaknesses = comp.strengths_weaknesses.weaknesses.map(b => appendSourceIfMissing(b, url));
        }
      }
    }

    // Global arrays
    const pickAnyUrl = () => {
      for (const s of signals) {
        const it = (s.items || []).find(i => i.url);
        if (it?.url) return it.url;
      }
      return undefined;
    };
    const globalUrl = pickAnyUrl();
    if (Array.isArray(analysis.key_takeaways) && globalUrl) {
      analysis.key_takeaways = analysis.key_takeaways.map(b => appendSourceIfMissing(b, globalUrl));
    }
    if (Array.isArray(analysis.strategic_insights) && globalUrl) {
      analysis.strategic_insights = analysis.strategic_insights.map(b => appendSourceIfMissing(b, globalUrl));
    }

    return JSON.stringify(analysis, null, 2);
  } catch (error) {
    console.error("OpenAI summarization error:", error);
    throw new Error(`Failed to generate competitive intelligence summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}