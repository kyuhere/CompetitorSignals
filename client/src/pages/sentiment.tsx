import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Link } from "wouter";
import SocialSentiment from "@/components/SocialSentiment";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SocialSentimentResult {
  reviews?: {
    averageRating: number;
    totalReviews: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    topQuotes: Array<{
      text: string;
      author?: string;
      source?: string;
      url?: string;
      rating?: number;
    }>;
  };
  socialMedia?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    totalMentions: number;
    platforms: string[];
    topQuotes: Array<{
      text: string;
      author?: string;
      source?: string;
      url?: string;
    }>;
  };
  query: string;
  message?: string;
}

export default function SentimentPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SocialSentimentResult | null>(null);
  const { toast } = useToast();

  const sentimentMutation = useMutation({
    mutationFn: async (searchQuery: string): Promise<SocialSentimentResult> => {
      return apiRequest('POST', '/api/sentiment/social', { query: searchQuery });
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.message && (!data.reviews && !data.socialMedia)) {
        toast({
          title: "No Data Found",
          description: data.message,
          variant: "default",
        });
      } else {
        toast({
          title: "Analysis Complete",
          description: `Social sentiment analysis completed for "${data.query}"`,
          variant: "default",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze social sentiment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      sentimentMutation.mutate(query.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
            <Badge variant="outline" className="text-xs">
              Social Sentiment Analysis
            </Badge>
          </div>
          
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Social Sentiment Analysis
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Analyze public sentiment about companies, products, or topics from social media and review platforms. 
            Get insights from Reddit discussions, Hacker News comments, and more.
          </p>
        </div>

        {/* Search Section */}
        <Card className="mb-8" data-testid="card-search">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5" />
              Analyze Social Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1">
                <Input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter company name, product, or topic (e.g., 'OpenAI', 'Tesla', 'React')"
                  className="w-full"
                  data-testid="input-sentiment-query"
                />
              </div>
              <Button
                type="submit"
                disabled={!query.trim() || sentimentMutation.isPending}
                className="px-6"
                data-testid="button-analyze"
              >
                {sentimentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </form>
            
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="mb-2">
                <strong>What we analyze:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Reddit:</strong> Public discussions from relevant subreddits (news, business, technology)</li>
                <li><strong>Hacker News:</strong> Comments and discussions from the tech community</li>
                <li><strong>Sentiment Classification:</strong> AI-powered analysis to determine positive, negative, or neutral sentiment</li>
                <li><strong>Key Quotes:</strong> Most relevant comments and discussions</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Separator className="mb-8" />

        {/* Results Section */}
        {sentimentMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-12" data-testid="loading-sentiment">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <h3 className="text-lg font-medium mb-2">Analyzing Social Sentiment</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Searching Reddit and Hacker News for discussions about "{query}". This may take a few moments...
            </p>
          </div>
        )}

        {result && !sentimentMutation.isPending && (
          <div className="space-y-6" data-testid="sentiment-results">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Social Sentiment Analysis Results
              </h2>
              <p className="text-muted-foreground">
                Analysis for "{result.query}" • Powered by OpenAI
              </p>
            </div>

            <SocialSentiment
              reviews={result.reviews}
              socialMedia={result.socialMedia}
              query={result.query}
            />

            {/* Methodology */}
            <Card className="mt-8" data-testid="card-methodology">
              <CardHeader>
                <CardTitle className="text-lg">Analysis Methodology</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-2">Data Sources</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Reddit public discussions (news, business, tech subreddits)</li>
                      <li>Hacker News comments and stories</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">AI Analysis</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>OpenAI GPT-4 sentiment classification</li>
                      <li>Quote extraction and relevance scoring</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  This analysis provides a snapshot of recent public sentiment from available social media platforms. 
                  Results may not represent the complete market sentiment and should be used alongside other research methods.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Empty State */}
        {!result && !sentimentMutation.isPending && (
          <Card className="text-center py-12" data-testid="empty-state">
            <CardContent>
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Ready to Analyze Social Sentiment
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Enter a company name, product, or topic above to get started with social sentiment analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}