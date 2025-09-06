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
          "• Strength 1 [Source: bing.com/news]",
          "• Strength 2 [Source: bing.com/news]",
          "• Strength 3 [Source: bing.com/news]",
          "• Strength 4 [Source: bing.com/news]",
          "• Strength 5 [Source: bing.com/news]"
        ],
        "weaknesses": [
          "• Weakness 1 [Source: bing.com/news]",
          "• Weakness 2 [Source: bing.com/news]",
          "• Weakness 3 [Source: bing.com/news]",
          "• Weakness 4 [Source: bing.com/news]",
          "• Weakness 5 [Source: bing.com/news]"
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
        "• Recent product launch or update with market impact [Source: bing.com/news]",
        "• Partnership announcements and strategic moves [Source: bing.com/news]",
        "• Executive changes or organizational updates [Source: bing.com/news]"
      ],
      "funding_business": [
        "• Funding rounds with amounts and investors [Source: bing.com/news]",
        "• Business expansion or market entry news [Source: bing.com/news]",
        "• Revenue or growth announcements [Source: bing.com/news]"
      ]
    }
  ],
  "key_takeaways": [
    "• Key takeaway 1: Most important finding for your business [Source: bing.com/news]",
    "• Key takeaway 2: Competitor strategy change to monitor [Source: bing.com/news]",
    "• Key takeaway 3: Market opportunity to capitalize on [Source: bing.com/news]",
    "• Key takeaway 4: Threat or challenge to address [Source: bing.com/news]",
    "• Key takeaway 5: Innovation or trend to watch [Source: bing.com/news]",
    "• Key takeaway 6: Partnership or alliance development [Source: bing.com/news]",
    "• Key takeaway 7: Pricing or positioning insight [Source: bing.com/news]",
    "• Key takeaway 8: Customer sentiment or feedback trend [Source: bing.com/news]",
    "• Key takeaway 9: Technology or product advancement [Source: bing.com/news]",
    "• Key takeaway 10: Funding or investment activity [Source: bing.com/news]",
    "• Key takeaway 11: Market expansion or entry news [Source: bing.com/news]",
    "• Key takeaway 12: Leadership or organizational change [Source: bing.com/news]",
    "• Key takeaway 13: Regulatory or industry development [Source: bing.com/news]",
    "• Key takeaway 14: Strategic weakness to exploit [Source: bing.com/news]",
    "• Key takeaway 15: Future outlook or prediction [Source: bing.com/news]"
  ],
  "strategic_insights": [
    "• Cross-competitor trend 1 with market implications [Source: bing.com/news]",
    "• Industry development 2 affecting competitive landscape [Source: bing.com/news]",
    "• Strategic opportunity or threat 3 for consideration [Source: bing.com/news]"
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
- Include [Source: bing.com/news] references at the end of key points when data is available
- Recent developments (last 30 days prioritized)
- Business impact and strategic implications
- Rate activity level based on signal volume and recency
- Use short, clean source references like [Source: bing.com/news] instead of full URLs
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
