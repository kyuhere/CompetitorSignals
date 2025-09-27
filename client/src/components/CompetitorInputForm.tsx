import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Building2, Globe, DollarSign, Users, Package, Lock, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const [fresh, setFresh] = useState<boolean>(true);
  const [trackingLimitDialogOpen, setTrackingLimitDialogOpen] = useState(false);
  const { toast } = useToast();

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
      setTrackingLimitDialogOpen(true);
      return;
    }

    onAnalyze({
      competitors: competitors.trim(),
      sources,
      autoTrack: true,
      competitorList,
      nocache: fresh
    });
  };

  const competitorCount = (() => {
    const toCanonical = (s: string) => {
      const lower = (s || '').trim().toLowerCase();
      const noProto = lower.replace(/^https?:\/\//, '').replace(/^www\./, '');
      const firstToken = noProto.split('/')[0];
      const baseLabel = firstToken.includes('.') ? firstToken.split('.')[0] : firstToken;
      return baseLabel.replace(/[^a-z0-9]/g, '');
    };
    const seen = new Set<string>();
    competitors
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .forEach(name => {
        const canon = toCanonical(name);
        if (canon) seen.add(canon);
      });
    return seen.size;
  })();

  const isOverLimit = usage && competitorCount > usage.limit;
  // Allow submission if user has competitors to analyze, regardless of remaining tracking slots
  const canSubmit = competitors.trim() && !isOverLimit;

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
                (up to {usage?.limit || 3} for {usage?.isLoggedIn ? 'logged-in' : 'guest'} users)
              </span>
            </Label>
            <Textarea
              id="competitors"
              value={competitors}
              onChange={(e) => {
                // Preserve exact user input (no forced capitalization/lowercasing)
                setCompetitors(e.target.value);
              }}
              rows={3}
              placeholder={`Enter competitors (one per line). You can use name, domain, or both.\nExamples:\nOpenAI\nopenai.com\nOpenAI, openai.com`}
              className="resize-none"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-testid="textarea-competitors"
            />
            {/* Domain hint for reviews */}
            {(() => {
              const domainRegex = /(?:^|[\s,])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,}))+(?=$|[\s,])/i;
              const lines = competitors.split('\n').map(l => l.trim()).filter(Boolean);
              const linesMissingDomain = lines.filter(l => !domainRegex.test(l));
              if (lines.length > 0 && linesMissingDomain.length > 0) {
                return (
                  <p className="text-xs text-muted-foreground mt-2">
                    For reviews, include the company's domain (e.g., <span className="font-medium">openai.com</span>). You can enter it as “Name, domain.com”.
                  </p>
                );
              }
              return null;
            })()}
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
                  <Badge variant="outline" className="ml-1 text-xs">Coming Soon</Badge>
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
              <span className="font-medium">Tracking limit notice:</span>{" "}
              You have <span className="font-semibold" data-testid="text-remaining-queries">{usage.remaining}</span> tracking slots remaining. 
              You can still analyze existing tracked competitors.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Tracking Limit Dialog */}
      <Dialog open={trackingLimitDialogOpen} onOpenChange={setTrackingLimitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-xl">
              <Lock className="w-6 h-6 mr-2 text-orange-500" />
              Tracking Limit Reached
            </DialogTitle>
            <DialogDescription className="text-base">
              You're tracking {usage?.current} of {usage?.limit} competitors. Remove a tracked competitor to analyze new ones, or upgrade to premium for unlimited tracking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-800">Current tracking:</span>
                <span className="text-lg font-bold text-orange-600">
                  {usage?.current} / {usage?.limit}
                </span>
              </div>
              <p className="text-xs text-orange-700">
                Each analysis automatically tracks competitors for ongoing monitoring
              </p>
            </div>

            <div className="flex flex-col space-y-3">
              <Button
                className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-3"
                onClick={() => {
                  toast({
                    title: "Premium Coming Soon!",
                    description: "Upgrade to premium for unlimited competitor tracking",
                  });
                  setTrackingLimitDialogOpen(false);
                }}
              >
                <Crown className="w-5 h-5 mr-2" />
                Upgrade to Premium
              </Button>

              <Button
                variant="outline"
                onClick={() => setTrackingLimitDialogOpen(false)}
                className="w-full"
              >
                Manage Tracked Competitors
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}