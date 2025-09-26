import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import AppHeader from "@/components/AppHeader";
import CompetitorInputForm from "@/components/CompetitorInputForm";
import CompetitorReport from "@/components/CompetitorReport";
import ReportHistory from "@/components/ReportHistory";
import TrackedCompetitors from "@/components/TrackedCompetitors";
import LoadingModal from "@/components/LoadingModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Building2, TrendingUp, Zap, Target, FileText } from "lucide-react";

export default function Home() {
  const [currentReport, setCurrentReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"tracking" | "analysis" | "reports">("tracking");
  const [showSignupModal, setShowSignupModal] = useState(false);
  const { isAuthenticated } = useAuth();

  // Fetch usage stats
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["/api/usage"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch user reports
  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/reports"],
  });

  // Guest gating: one free search per session
  const isGuest = useMemo(() => {
    return !isAuthenticated;
  }, [isAuthenticated]);

  const [guestHasSearched, setGuestHasSearched] = useState<boolean>(false);

  useEffect(() => {
    try {
      const flag = localStorage.getItem("guest_one_free_search_done");
      setGuestHasSearched(flag === "1");
    } catch {}
  }, []);

  const triggerSignupGate = () => setShowSignupModal(true);
  const shouldBlockTabs = isGuest && (guestHasSearched || !!currentReport);

  // Analyze competitors mutation
  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
      // Block second search for guests
      if (isGuest) {
        try {
          const flag = localStorage.getItem("guest_one_free_search_done");
          if (flag === "1") {
            triggerSignupGate();
            throw new Error("Sign up required for additional searches");
          }
        } catch {}
      }
      setIsAnalyzing(true);
      setLoadingProgress(10);
      
      // Progress simulation matching landing page
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          const increment = Math.random() * 8 + 2;
          return Math.min(90, prev + increment);
        });
      }, 1000);
      
      try {
        // Auto-track competitors if requested (dedupe by canonical identity)
        if (data.autoTrack && data.competitorList) {
          const toCanonical = (s: string) => {
            const lower = (s || '').trim().toLowerCase();
            const noProto = lower.replace(/^https?:\/\//, '').replace(/^www\./, '');
            const firstToken = noProto.split('/')[0];
            const baseLabel = firstToken.includes('.') ? firstToken.split('.')[0] : firstToken;
            return baseLabel.replace(/[^a-z0-9]/g, '');
          };
          const seen = new Set<string>();
          for (const competitorName of data.competitorList) {
            const canon = toCanonical(competitorName);
            if (!canon || seen.has(canon)) continue;
            seen.add(canon);
            try {
              await apiRequest("POST", "/api/competitors/tracked", {
                competitorName,
                trackingEnabled: true
              });
            } catch (error) {
              // Ignore errors for duplicate competitors or limit exceeded
              console.log(`Could not track ${competitorName}:`, error);
            }
          }
        }
        
        const response = await apiRequest("POST", "/api/analyze", data);
        const result = await response.json();
        clearInterval(progressInterval);
        setLoadingProgress(100);
        
        setTimeout(() => setLoadingProgress(0), 500);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        setLoadingProgress(0);
        throw error;
      }
    },
    onSuccess: (report) => {
      setCurrentReport(report);
      if (isGuest) {
        try { localStorage.setItem("guest_one_free_search_done", "1"); } catch {}
        setGuestHasSearched(true);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/tracked"] });
      toast({
        title: "Analysis Complete!",
        description: "Your competitor report has been generated and competitors have been tracked.",
      });
    },
    onError: (error) => {
      // Suppress noisy toast for guest gating (we already showed modal)
      if (error instanceof Error && error.message.includes('Sign up required')) {
        return;
      }
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "An error occurred while analyzing competitors.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsAnalyzing(false);
    },
  });

  const handleAnalysis = (formData: any) => {
    // Guard before mutation for guests who already used the free search
    if (isGuest && guestHasSearched) {
      triggerSignupGate();
      return;
    }
    analyzeMutation.mutate(formData);
  };

  const handleMainTabChange = (value: string) => {
    if (shouldBlockTabs) {
      triggerSignupGate();
      return;
    }
    setActiveTab(value as any);
  };

  const handleLoadReport = (report: any) => {
    setCurrentReport(report);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader usage={usage as any} />
      
      {/* Hero Section - Glass Lemon Style */}
      <div className="relative py-16 mb-8">
        <div className="absolute inset-0" style={{background: 'var(--gradient-primary)', opacity: 0.08}}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight mb-4">
            <span className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl inline-block">
              Competitor Lemonade
            </span>
          </h1>
          <p className="text-xl font-medium mb-6">
            Get the most out of your competitive intelligence
          </p>
          <div className="text-lg font-medium flex items-center justify-center gap-6">
            <span className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              AI-powered insights
            </span>
            <span className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Real-time tracking
            </span>
            <span className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Strategic advantage
            </span>
          </div>
        </div>
      </div>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={handleMainTabChange} className="w-full">
          <TabsList
            className="w-full overflow-x-auto overflow-y-hidden flex items-center gap-2 sm:gap-3 mb-8 glass-panel p-1 rounded-2xl pl-2 pr-2"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <TabsTrigger value="tracking" className="glass-button flex items-center font-semibold text-sm whitespace-nowrap h-10 leading-none px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-tracking">
              <Target className="w-4 h-4 mr-2 flex-shrink-0" />
              Competitor Tracking
            </TabsTrigger>
            <TabsTrigger value="analysis" className="glass-button flex items-center font-semibold text-sm whitespace-nowrap h-10 leading-none px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-analysis">
              <TrendingUp className="w-4 h-4 mr-2 flex-shrink-0" />
              One-Time Analysis
            </TabsTrigger>
            <TabsTrigger value="reports" className="glass-button flex items-center font-semibold text-sm whitespace-nowrap h-10 leading-none px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-reports">
              <BarChart3 className="w-4 h-4 mr-2 flex-shrink-0" />
              Report History
            </TabsTrigger>
          </TabsList>

          {/* Competitor Tracking Tab */}
          <TabsContent value="tracking" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column: Tracked Competitors */}
              <div className="xl:col-span-1 space-y-6">
                <TrackedCompetitors onShowReport={setCurrentReport} />
              </div>

              {/* Right Column: Report Display */}
              <div className="xl:col-span-2">
                {currentReport ? (
                  <CompetitorReport
                    report={currentReport}
                    guestGateActive={isGuest && guestHasSearched}
                    onGuestGate={() => triggerSignupGate()}
                    onAnalyzeRequested={(competitorList: string[]) => {
                      if (isGuest && guestHasSearched) { triggerSignupGate(); return; }
                      const data = {
                        competitors: competitorList.join('\n'),
                        sources: { news: true, funding: true, social: true, products: false },
                        autoTrack: true,
                        competitorList,
                        nocache: true,
                      };
                      handleAnalysis(data);
                    }}
                  />
                ) : (
                  <Card className="h-96 flex items-center justify-center card-rounded hover-lift">
                    <CardContent className="text-center">
                      <Target className="w-16 h-16 mx-auto mb-4 text-primary" />
                      <h3 className="text-2xl font-bold text-foreground mb-3">Track Your Competitors</h3>
                      <p className="text-muted-foreground text-lg font-medium mb-4">
                        Add competitors to your tracking list for ongoing monitoring and insights.
                      </p>
                      <p className="text-sm text-muted-foreground bg-soft-green p-3 rounded-xl border-2 border-primary/20">
                        We'll automatically analyze them every two weeks!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* One-Time Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column: Input Form */}
              <div className="xl:col-span-1 space-y-6">
                <Card className="card-rounded hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center text-xl font-bold">
                      <TrendingUp className="w-6 h-6 mr-3 text-primary" />
                      One-Time Analysis
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">
                      Get instant competitive insights without long-term tracking.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <CompetitorInputForm 
                      onAnalyze={handleAnalysis}
                      isLoading={analyzeMutation.isPending}
                      usage={usage as any}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Report Display */}
              <div className="xl:col-span-2">
                {currentReport ? (
                  <CompetitorReport
                    report={currentReport}
                    guestGateActive={isGuest && guestHasSearched}
                    onGuestGate={() => triggerSignupGate()}
                    onAnalyzeRequested={(competitorList: string[]) => {
                      if (isGuest && guestHasSearched) { triggerSignupGate(); return; }
                      const data = {
                        competitors: competitorList.join('\n'),
                        sources: { news: true, funding: true, social: true, products: false },
                        autoTrack: true,
                        competitorList,
                        nocache: true,
                      };
                      handleAnalysis(data);
                    }}
                  />
                ) : (
                  <Card className="h-96 flex items-center justify-center card-rounded hover-lift">
                    <CardContent className="text-center">
                      <BarChart3 className="w-16 h-16 mx-auto mb-4 text-primary" />
                      <h3 className="text-2xl font-bold text-foreground mb-3">Ready for Analysis</h3>
                      <p className="text-muted-foreground text-lg font-medium mb-4">
                        Enter competitor names to generate your instant analysis report.
                      </p>
                      <p className="text-sm text-muted-foreground bg-soft-blue p-3 rounded-xl border-2 border-primary/20">
                        Get comprehensive competitive intelligence in minutes!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Report History Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                Your Analysis History
              </h2>
              <p className="text-muted-foreground font-medium">
                Browse through all your previous competitive intelligence reports
              </p>
            </div>
            
            <ReportHistory 
              reports={(reports as any) || []}
              isLoading={reportsLoading}
              onLoadReport={handleLoadReport}
              guestGateActive={isGuest && guestHasSearched}
              onGuestGate={() => triggerSignupGate()}
            />
            
            {currentReport && (
              <div className="mt-8">
                <CompetitorReport
                  report={currentReport}
                  guestGateActive={isGuest && guestHasSearched}
                  onGuestGate={() => triggerSignupGate()}
                  onAnalyzeRequested={(competitorList: string[]) => {
                    if (isGuest && guestHasSearched) { triggerSignupGate(); return; }
                    const data = {
                      competitors: competitorList.join('\n'),
                      sources: { news: true, funding: true, social: true, products: false },
                      autoTrack: true,
                      competitorList,
                      nocache: true,
                    };
                    handleAnalysis(data);
                  }}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Signup Gate Modal for Guests */}
        <div>
          <Dialog open={showSignupModal} onOpenChange={setShowSignupModal as any}>
            <DialogContent className="w-[95vw] sm:max-w-md p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Sign up to continue</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You’ve used your free preview. Create a free account to:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1 text-foreground">
                  <li>Save and revisit reports</li>
                  <li>Track competitors and get periodic updates</li>
                  <li>Access detailed tabs: Analysis, Reviews, Market, Tech</li>
                </ul>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setShowSignupModal(false)}>Not now</Button>
                  <Button onClick={() => { window.location.href = '/api/login'; }} className="bg-primary text-primary-foreground">
                    Sign up free
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      <LoadingModal isOpen={isAnalyzing} progress={loadingProgress} />
    </div>
  );
}
