import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarChart3, Users, TrendingUp, Shield, Search, Download, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CompetitorReport from "@/components/CompetitorReport";

export default function Landing() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const { toast } = useToast();

  // Store the guest search result in localStorage for potential account creation
  const storeGuestSearch = (result: any) => {
    if (result && result.id && result.id.startsWith('temp_')) {
      localStorage.setItem('guestSearchResult', JSON.stringify(result));
    }
  };

  const searchMutation = useMutation({
    mutationFn: async (competitor: string) => {
      // Reset and start progress
      setLoadingProgress(10);
      
      // Simulate faster progress with optimized backend
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          // More controlled progress increments
          const increment = Math.random() * 8 + 2; // 2-10% increments
          return Math.min(90, prev + increment); // Cap at 90%
        });
      }, 1000); // More reasonable timing
      
      try {
        const result = await apiRequest('POST', '/api/analyze', {
          competitors: competitor,
          sources: { news: true, funding: true, social: true, products: false }
        });
        
        clearInterval(progressInterval);
        setLoadingProgress(100);
        
        // Reset progress after a short delay
        setTimeout(() => setLoadingProgress(0), 500);
        
        return await result.json();
      } catch (error) {
        clearInterval(progressInterval);
        setLoadingProgress(0);
        throw error;
      }
    },
    onSuccess: (data) => {
      setSearchResult(data);
      storeGuestSearch(data);
      // Auto-scroll to the analysis section after a short delay
      setTimeout(() => {
        const analysisSection = document.querySelector('[data-scroll-target="analysis"]');
        if (analysisSection) {
          analysisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
    },
    onError: (error: any) => {
      if (error.message.includes('429')) {
        setShowSignupDialog(true);
      } else {
        toast({
          title: "Search Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive"
        });
      }
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    searchMutation.mutate(searchQuery.trim());
  };

  const handleExportAttempt = () => {
    setShowSignupDialog(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">Competitor Lemonade</span>
            </div>
            
            <Button 
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login"
              className="btn-primary"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6">
            Track Your Competitors with 
            <span className="bg-primary text-primary-foreground px-3 py-1 rounded-lg">AI Intelligence</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            Get actionable insights from news, funding, and social signals. 
            Try it now with one free competitor search.
          </p>
          
          {/* Google-style Search Box */}
          <div className="max-w-2xl mx-auto mb-8">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    // Auto-capitalize first letter of each word
                    const capitalizedValue = e.target.value
                      .split(' ')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                      .join(' ');
                    setSearchQuery(capitalizedValue);
                  }}
                  placeholder="Enter a competitor name (e.g., OpenAI, Tesla, Spotify)"
                  className="w-full h-14 text-lg pl-6 pr-16 border-2 border-border focus:border-primary rounded-full shadow-lg font-medium"
                  data-testid="input-competitor-search"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!searchQuery.trim() || searchMutation.isPending}
                  className="absolute right-2 top-2 h-10 w-10 rounded-full p-0 btn-primary"
                  data-testid="button-search"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              {searchMutation.isPending && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {loadingProgress < 30 ? "Gathering competitor signals..." :
                       loadingProgress < 70 ? "Processing data in parallel..." :
                       loadingProgress < 90 ? "AI analysis in progress..." :
                       "Finalizing report..."}
                    </span>
                    <span>{Math.round(loadingProgress)}%</span>
                  </div>
                  <Progress value={loadingProgress} className="w-full h-2" />
                </div>
              )}
            </form>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-get-started"
              className="btn-primary text-lg px-8 py-4 h-auto"
            >
              Get Full Access
            </Button>
            <Button variant="outline" size="lg" data-testid="button-learn-more" className="text-lg px-8 py-4 h-auto border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-medium">
              Learn More
            </Button>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge className="bg-soft-green text-foreground font-medium px-4 py-2">No Credit Card Required</Badge>
            <Badge className="bg-soft-blue text-foreground font-medium px-4 py-2">5 Reports Every Two Weeks</Badge>
            <Badge className="bg-primary text-primary-foreground font-medium px-4 py-2">AI-Powered Insights</Badge>
          </div>
        </div>
      </section>

      {/* Report Preview Section */}
      {searchResult && (
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30" data-scroll-target="analysis">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-4">Your Competitor Analysis</h2>
              <p className="text-muted-foreground font-medium">Here's your competitive intelligence report preview:</p>
            </div>
            
            <CompetitorReport 
              report={searchResult}
            />
            
            {/* Export/Email and CTA Section */}
            <div className="mt-8 space-y-6">
              {/* Export/Email Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleExportAttempt}
                  size="lg"
                  className="btn-primary text-lg px-8 py-4 h-auto"
                  data-testid="button-export-email"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Export / Email Report
                </Button>
              </div>
              
              {/* Bi-weekly CTA */}
              <Card className="bg-lemon-light border-2 border-primary/30 card-rounded hover-lift">
                <CardContent className="p-6 text-center">
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    Want to receive this as a bi-weekly report?
                  </h3>
                  <p className="text-muted-foreground mb-6 font-medium">
                    Sign up to get 5 competitor reports every two weeks, plus export and email features.
                  </p>
                  <Button
                    onClick={() => window.location.href = '/api/login'}
                    className="btn-primary text-lg px-8 py-4 h-auto"
                    data-testid="button-biweekly-signup"
                  >
                    Sign Up for Bi-weekly Reports
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">
            Everything You Need for Competitive Intelligence
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Signal Aggregation</h3>
                <p className="text-muted-foreground">
                  Automatically collect news, funding announcements, and social mentions from multiple sources.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">AI Analysis</h3>
                <p className="text-muted-foreground">
                  Get intelligent summaries and strategic insights powered by advanced AI models.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Team Ready</h3>
                <p className="text-muted-foreground">
                  Share reports with your team and keep track of competitive landscapes over time.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">
            Simple, Transparent Pricing
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-foreground mb-2">Free</h3>
                  <p className="text-3xl font-bold text-primary mb-4">$0<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  
                  <ul className="text-left space-y-3 mb-6">
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">5 competitors per analysis</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Report history</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Basic signal sources</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Export to PDF</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="w-full" 
                    onClick={() => window.location.href = '/api/login'}
                    data-testid="button-start-free"
                  >
                    Start Free
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary">
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-foreground">Premium</h3>
                    <Badge>Coming Soon</Badge>
                  </div>
                  <p className="text-3xl font-bold text-primary mb-4">$29<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  
                  <ul className="text-left space-y-3 mb-6">
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Unlimited competitors</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Scheduled reports</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Advanced data sources</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Trend tracking</span>
                    </li>
                  </ul>
                  
                  <Button variant="outline" className="w-full" disabled data-testid="button-premium">
                    Coming Soon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    
      {/* Signup Dialog */}
      <Dialog open={showSignupDialog} onOpenChange={setShowSignupDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Great! Your search is complete</DialogTitle>
            <DialogDescription>
              {searchResult ? 
                "Ready to export your report or save it for later? Sign up for free to unlock export features and get 5 competitor analyses every two weeks." :
                "You've used your free preview. Sign up to get 5 competitor analyses every two weeks plus export and email features."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium text-foreground mb-2">With a free account you get:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 5 competitor analyses every two weeks</li>
                <li>• Full AI-powered reports with source links</li>
                <li>• Export and email your reports</li>
                <li>• Report history and social sentiment analysis</li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="flex-1"
                data-testid="button-signup-dialog"
              >
                Sign Up Free
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowSignupDialog(false)}
                className="flex-1"
                data-testid="button-maybe-later"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
