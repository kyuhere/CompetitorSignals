import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

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

export async function summarizeCompetitorSignals(
  signals: CompetitorSignal[],
  competitorNames: string[]
): Promise<string> {
  try {
    const prompt = `
You are an expert competitive intelligence analyst. Analyze the following competitor signals and generate a comprehensive competitive intelligence report.

COMPETITOR NAMES: ${competitorNames.join(', ')}

SIGNALS DATA:
${JSON.stringify(signals, null, 2)}

Please generate a detailed competitive intelligence analysis in the following JSON format:

{
  "executive_summary": "A 2-3 sentence overview of the competitive landscape and key trends",
  "competitors": [
    {
      "competitor": "Company Name",
      "activity_level": "high|moderate|low",
      "recent_developments": ["Brief bullet point 1", "Brief bullet point 2", "etc"],
      "funding_business": ["Funding/business related bullet points"],
      "social_sentiment": {
        "score": 75,
        "mentions_count": 1247
      },
      "key_insights": ["Strategic insight 1", "Strategic insight 2"]
    }
  ],
  "strategic_insights": [
    "Cross-competitor strategic insight 1",
    "Market trend insight 2",
    "Opportunity or threat insight 3"
  ],
  "methodology": {
    "sources_analyzed": ["News APIs", "RSS Feeds", "Social Media"],
    "total_signals": ${signals.reduce((acc, s) => acc + s.items.length, 0)},
    "confidence_level": "high|medium|low"
  }
}

Focus on:
- Actionable insights over generic observations
- Recent developments (last 30 days prioritized)
- Business impact and strategic implications
- Funding, partnerships, product launches, and market positioning
- Keep bullet points concise but informative
- Rate activity level based on signal volume and recency
- Estimate social sentiment realistically based on available data
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
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
      temperature: 0.3, // Lower temperature for more consistent analysis
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
