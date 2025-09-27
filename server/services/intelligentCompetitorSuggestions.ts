import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

interface RawSuggestion {
  name: string;
  domain: string;
  url: string;
  source: 'google_search' | 'manual';
}

interface AnalyzedSuggestion {
  name: string;
  domain: string;
  url: string;
  relevanceScore: number; // 0-100
  reasoning: string;
  category: string; // e.g., "Direct Competitor", "Alternative Solution", "Adjacent Market"
  isValid: boolean;
}

interface CompetitorAnalysisResult {
  suggestions: AnalyzedSuggestion[];
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

class IntelligentCompetitorSuggestions {
  
  // Analyze and validate competitor suggestions using ChatGPT
  async analyzeCompetitorSuggestions(
    originalCompetitor: string,
    rawSuggestions: RawSuggestion[]
  ): Promise<CompetitorAnalysisResult> {
    if (rawSuggestions.length === 0) {
      return {
        suggestions: [],
        summary: "No competitor suggestions found to analyze.",
        confidence: 'low'
      };
    }

    try {
      const prompt = `
You are an expert business analyst specializing in competitive intelligence. Analyze the following competitor suggestions for "${originalCompetitor}" and determine their relevance and validity.

ORIGINAL COMPANY: ${originalCompetitor}

SUGGESTED COMPETITORS:
${rawSuggestions.map((s, i) => `${i + 1}. ${s.name} (${s.domain}) - ${s.url}`).join('\n')}

For each suggestion, analyze:
1. Is this a legitimate business/company?
2. How relevant is it as a competitor to ${originalCompetitor}?
3. What type of competitor relationship exists?
4. Is the domain/website valid and active?

Respond with JSON only:
{
  "suggestions": [
    {
      "name": "Company Name",
      "domain": "domain.com",
      "url": "https://...",
      "relevanceScore": 85,
      "reasoning": "Direct competitor offering similar SaaS solutions in the same market segment",
      "category": "Direct Competitor|Alternative Solution|Adjacent Market|Supplier|Partner|Invalid",
      "isValid": true
    }
  ],
  "summary": "Brief analysis of the competitive landscape and suggestion quality",
  "confidence": "high|medium|low"
}

SCORING CRITERIA:
- 90-100: Direct competitor, same market, similar products/services
- 70-89: Strong alternative or adjacent market player
- 50-69: Loosely related or different market segment
- 30-49: Weak connection or different industry
- 0-29: Invalid, unrelated, or non-existent company

Only include suggestions with relevanceScore >= 50 and isValid = true.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert competitive intelligence analyst. Analyze competitor suggestions accurately and provide structured JSON responses only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.2
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error("No response from OpenAI");
      }

      const analysis: CompetitorAnalysisResult = JSON.parse(result);
      
      // Validate and clean the response
      analysis.suggestions = analysis.suggestions
        .filter(s => s.isValid && s.relevanceScore >= 50)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5); // Top 5 suggestions

      return analysis;
    } catch (error) {
      console.error("Error analyzing competitor suggestions:", error);
      
      // Fallback: return raw suggestions with basic scoring
      return {
        suggestions: rawSuggestions.map(s => ({
          name: s.name,
          domain: s.domain,
          url: s.url,
          relevanceScore: 60, // Default moderate score
          reasoning: "Unable to analyze with AI - basic suggestion from search results",
          category: "Potential Competitor",
          isValid: true
        })).slice(0, 3),
        summary: "AI analysis unavailable - showing basic search results",
        confidence: 'low'
      };
    }
  }

  // Enhanced competitor discovery with multiple sources
  async discoverCompetitors(
    originalCompetitor: string,
    existingCompetitors: string[] = []
  ): Promise<AnalyzedSuggestion[]> {
    try {
      // First, get raw suggestions from Google Search (existing method)
      const { signalAggregator } = await import('./signalAggregator');
      const googleSuggestions = await signalAggregator.getSuggestedCompetitorsFor(originalCompetitor);
      
      // Convert to our format
      const rawSuggestions: RawSuggestion[] = googleSuggestions.map((s: any) => ({
        name: s.name,
        domain: s.domain,
        url: s.url,
        source: 'google_search' as const
      }));

      // Add AI-generated suggestions based on company analysis
      const aiSuggestions = await this.generateAICompetitorSuggestions(originalCompetitor);
      rawSuggestions.push(...aiSuggestions);

      // Remove duplicates and existing competitors
      const existingSet = new Set(existingCompetitors.map(c => c.toLowerCase()));
      const uniqueSuggestions = rawSuggestions.filter((s, index, self) => {
        const domain = s.domain.toLowerCase();
        const name = s.name.toLowerCase();
        
        // Skip if already in existing competitors
        if (existingSet.has(name)) return false;
        
        // Skip duplicates by domain
        return self.findIndex(other => other.domain.toLowerCase() === domain) === index;
      });

      // Analyze with ChatGPT
      const analysis = await this.analyzeCompetitorSuggestions(originalCompetitor, uniqueSuggestions);
      
      return analysis.suggestions;
    } catch (error) {
      console.error("Error in discoverCompetitors:", error);
      return [];
    }
  }

  // Generate AI-based competitor suggestions using business knowledge
  private async generateAICompetitorSuggestions(originalCompetitor: string): Promise<RawSuggestion[]> {
    try {
      const prompt = `
You are a business intelligence expert. Based on your knowledge, suggest 3-5 real competitor companies for "${originalCompetitor}".

Focus on:
1. Direct competitors in the same industry/market
2. Companies offering similar products/services
3. Well-known alternatives customers might consider

For each suggestion, provide:
- Company name
- Primary domain (website)
- Brief reason why they're a competitor

Respond with JSON only:
{
  "competitors": [
    {
      "name": "Company Name",
      "domain": "company.com",
      "reasoning": "Direct competitor offering similar solutions"
    }
  ]
}

Only suggest real, established companies with active websites.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a business intelligence expert with knowledge of companies across industries. Provide accurate competitor suggestions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.3
      });

      const result = response.choices[0].message.content;
      if (!result) return [];

      const aiResult = JSON.parse(result);
      
      return (aiResult.competitors || []).map((c: any) => ({
        name: c.name,
        domain: c.domain,
        url: `https://${c.domain}`,
        source: 'manual' as const
      }));
    } catch (error) {
      console.error("Error generating AI competitor suggestions:", error);
      return [];
    }
  }

  // Validate a single competitor suggestion
  async validateCompetitor(
    originalCompetitor: string,
    suggestedCompetitor: { name: string; domain: string; url: string }
  ): Promise<AnalyzedSuggestion | null> {
    try {
      const analysis = await this.analyzeCompetitorSuggestions(originalCompetitor, [
        { ...suggestedCompetitor, source: 'manual' as const }
      ]);
      
      return analysis.suggestions[0] || null;
    } catch (error) {
      console.error("Error validating competitor:", error);
      return null;
    }
  }
}

export const intelligentCompetitorSuggestions = new IntelligentCompetitorSuggestions();
export default intelligentCompetitorSuggestions;
