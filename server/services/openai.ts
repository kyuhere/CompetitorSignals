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

Please generate a detailed competitive intelligence analysis in news-style format with bullet points using the following JSON structure:

{
  "executive_summary": "• Brief overview of competitive landscape\n• Key market trends and developments\n• Overall activity assessment",
  "competitors": [
    {
      "competitor": "Company Name",
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
      ],
      "social_sentiment": {
        "score": 75,
        "mentions_count": 1247,
        "quotes": [
          "\"Positive mention or review quote\" [Source: bing.com/news]",
          "\"Another sentiment quote\" [Source: bing.com/news]"
        ]
      },
      "key_insights": [
        "• Strategic positioning analysis [Source: bing.com/news]",
        "• Competitive advantages or weaknesses [Source: bing.com/news]",
        "• Market opportunities or threats [Source: bing.com/news]"
      ]
    }
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

Focus on:
- Write in news-style format with bullet points (• symbol)
- Actionable insights over generic observations  
- Recent developments (last 30 days prioritized)
- Business impact and strategic implications
- Funding, partnerships, product launches, and market positioning
- Keep bullet points concise but informative (news headlines style)
- Rate activity level based on signal volume and recency
- Estimate social sentiment realistically based on available data
- Include [Source: bing.com/news] references at the end of key points
- Add direct quotes in social sentiment with source references
- Format all content with bullet points for easy readability
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
