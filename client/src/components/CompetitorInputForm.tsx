import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CompetitorInputFormProps {
  onAnalyze: (data: any) => void;
  isLoading: boolean;
  usage?: {
    current: number;
    limit: number;
    remaining: number;
    isLoggedIn: boolean;
  };
}

interface FormSources {
  news: boolean;
  funding: boolean;
  social: boolean;
  products: boolean;
}

export default function CompetitorInputForm({ onAnalyze, isLoading, usage }: CompetitorInputFormProps) {
  const [competitors, setCompetitors] = useState("");
  const [sources, setSources] = useState<FormSources>({
    news: true,
    funding: true,
    social: true,
    products: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!competitors.trim()) {
      return;
    }

    const competitorList = competitors
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (usage && competitorList.length > usage.limit) {
      return;
    }

    onAnalyze({
      competitors: competitors.trim(),
      sources,
    });
  };

  const competitorCount = competitors
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0).length;

  const isOverLimit = usage && competitorCount > usage.limit;
  const canSubmit = competitors.trim() && !isOverLimit && usage && usage.remaining > 0;

  return (
    <Card data-testid="card-competitor-input">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Analyze Competitors</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Competitor Names Input */}
          <div>
            <Label htmlFor="competitors" className="block text-sm font-medium text-foreground mb-2">
              Competitor Names
              <span className="text-xs text-muted-foreground ml-1">
                (up to {usage?.limit || 1} for {usage?.isLoggedIn ? 'logged-in' : 'guest'} users)
              </span>
            </Label>
            <Textarea
              id="competitors"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              rows={3}
              placeholder={`Enter competitor names, one per line\ne.g., OpenAI\nAnthropic\nGoogle AI`}
              className="resize-none"
              data-testid="textarea-competitors"
            />
            {isOverLimit && (
              <p className="text-xs text-destructive mt-1">
                Too many competitors. Limit: {usage?.limit}
              </p>
            )}
          </div>


          {/* Analysis Options */}
          <div className="space-y-3">
            <Label className="block text-sm font-medium text-foreground">Signal Sources</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="news"
                  checked={sources.news}
                  onCheckedChange={(checked) => setSources(prev => ({ ...prev, news: !!checked }))}
                  data-testid="checkbox-news"
                />
                <Label htmlFor="news" className="text-sm text-foreground">News & Press Releases</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="funding"
                  checked={sources.funding}
                  onCheckedChange={(checked) => setSources(prev => ({ ...prev, funding: !!checked }))}
                  data-testid="checkbox-funding"
                />
                <Label htmlFor="funding" className="text-sm text-foreground">Funding Announcements</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="social"
                  checked={sources.social}
                  onCheckedChange={(checked) => setSources(prev => ({ ...prev, social: !!checked }))}
                  data-testid="checkbox-social"
                />
                <Label htmlFor="social" className="text-sm text-foreground">Social Media Mentions</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="products"
                  checked={sources.products}
                  onCheckedChange={(checked) => setSources(prev => ({ ...prev, products: !!checked }))}
                  disabled
                  data-testid="checkbox-products"
                />
                <Label htmlFor="products" className="text-sm text-muted-foreground">
                  Product Launches
                  <Badge variant="outline" className="ml-1 text-xs">Premium</Badge>
                </Label>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit || isLoading}
            data-testid="button-generate-report"
          >
            <Search className="w-4 h-4 mr-2" />
            {isLoading ? "Generating..." : "Generate Competitor Report"}
          </Button>
        </form>

        {/* Rate Limiting Warning */}
        {usage && usage.remaining <= 1 && (
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Daily limit notice:</span>{" "}
              You have <span className="font-semibold" data-testid="text-remaining-queries">{usage.remaining}</span> analyses remaining today. 
              Resets at midnight UTC.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
