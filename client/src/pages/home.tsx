import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import AppHeader from "@/components/AppHeader";
import CompetitorInputForm from "@/components/CompetitorInputForm";
import CompetitorReport from "@/components/CompetitorReport";
import ReportHistory from "@/components/ReportHistory";
import LoadingModal from "@/components/LoadingModal";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3 } from "lucide-react";

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
        const response = await apiRequest("POST", "/api/analyze", data);
        clearInterval(progressInterval);
        setLoadingProgress(100);
        
        setTimeout(() => setLoadingProgress(0), 500);
        return response;
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
      toast({
        title: "Analysis Complete",
        description: "Your competitor report has been generated successfully.",
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
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Column: Input Form and Controls */}
          <div className="xl:col-span-1 space-y-6">
            <CompetitorInputForm 
              onAnalyze={handleAnalysis}
              isLoading={analyzeMutation.isPending}
              usage={usage}
            />
            
            <ReportHistory 
              reports={reports || []}
              isLoading={reportsLoading}
              onLoadReport={handleLoadReport}
            />
          </div>

          {/* Right Column: Report Display */}
          <div className="xl:col-span-2">
            {currentReport ? (
              <CompetitorReport report={currentReport} />
            ) : (
              <Card className="h-96 flex items-center justify-center">
                <CardContent className="text-center">
                  <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Report Selected</h3>
                  <p className="text-muted-foreground">
                    Enter competitor names in the form to generate your first analysis report.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <LoadingModal isOpen={isAnalyzing} progress={loadingProgress} />
    </div>
  );
}
