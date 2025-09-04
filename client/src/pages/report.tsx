import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import AppHeader from "@/components/AppHeader";
import CompetitorReport from "@/components/CompetitorReport";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function ReportPage() {
  const { id } = useParams();
  const { toast } = useToast();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["/api/reports", id],
  });

  const { data: usage } = useQuery({
    queryKey: ["/api/usage"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader usage={usage} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="h-96 flex items-center justify-center">
            <CardContent className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading report...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader usage={usage} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="h-96 flex items-center justify-center">
            <CardContent className="text-center">
              <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Report Not Found</h3>
              <p className="text-muted-foreground">
                The requested report could not be found or you don't have access to it.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader usage={usage} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CompetitorReport report={report} />
      </main>
    </div>
  );
}
