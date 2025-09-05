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
