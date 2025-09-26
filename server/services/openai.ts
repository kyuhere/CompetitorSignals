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

    // Validate the JSON response
    const analysis: AnalysisResult = JSON.parse(result);
    return JSON.stringify(analysis, null, 2);
  } catch (error) {
    console.error("OpenAI summarization error:", error);
    throw new Error(`Failed to generate competitive intelligence summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}