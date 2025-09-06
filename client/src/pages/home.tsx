import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { BarChart3, Building2, TrendingUp, Zap } from "lucide-react";

export default function Home() {
  const [currentReport, setCurrentReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const { toast } = useToast();

  // Fetch usage stats
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["/api/usage"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch user reports
  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/reports"],
  });

  // Analyze competitors mutation
  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
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
        // Auto-track competitors if requested
        if (data.autoTrack && data.competitorList) {
          for (const competitorName of data.competitorList) {
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
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/tracked"] });
      toast({
        title: "Analysis Complete",
        description: "Your competitor report has been generated and competitors have been tracked.",
      });
    },
    onError: (error) => {
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
    analyzeMutation.mutate(formData);
  };

  const handleLoadReport = (report: any) => {
    setCurrentReport(report);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader usage={usage} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="analysis" className="flex items-center" data-testid="tab-analysis">
              <TrendingUp className="w-4 h-4 mr-2" />
              Competitor Analysis
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center" data-testid="tab-reports">
              <BarChart3 className="w-4 h-4 mr-2" />
              Report History
            </TabsTrigger>
          </TabsList>

          {/* Main Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column: Input Form and Tracked Competitors */}
              <div className="xl:col-span-1 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2" />
                      Competitor Analysis
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Enter competitors to analyze and automatically track them for future insights.
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
                
                {/* Tracked Competitors Section */}
                <TrackedCompetitors onAnalyzeTracked={handleAnalysis} />
              </div>

              {/* Right Column: Report Display */}
              <div className="xl:col-span-2">
                {currentReport ? (
                  <CompetitorReport report={currentReport} />
                ) : (
                  <Card className="h-96 flex items-center justify-center">
                    <CardContent className="text-center">
                      <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">No Analysis Yet</h3>
                      <p className="text-muted-foreground">
                        Enter competitor names to generate your analysis report.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Report History Tab */}
          <TabsContent value="reports" className="space-y-6">
            <ReportHistory 
              reports={(reports as any) || []}
              isLoading={reportsLoading}
              onLoadReport={handleLoadReport}
            />
            
            {currentReport && (
              <div className="mt-8">
                <CompetitorReport report={currentReport} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <LoadingModal isOpen={isAnalyzing} progress={loadingProgress} />
    </div>
  );
}
