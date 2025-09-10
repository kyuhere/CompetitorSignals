import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import AppHeader from "@/components/AppHeader";
import CompetitorReport from "@/components/CompetitorReport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function ReportPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
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
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Reports
            </Button>
          </div>
          <Card className="h-96 flex items-center justify-center card-rounded">
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
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Reports
            </Button>
          </div>
          <Card className="h-96 flex items-center justify-center card-rounded">
            <CardContent className="text-center">
              <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Report Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The requested report could not be found or you don't have access to it.
              </p>
              <Button
                onClick={() => setLocation("/")}
                className="btn-primary"
              >
                Go to Reports
              </Button>
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
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-10 px-4 py-2 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors bg-[#ffee04]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Reports
          </Button>
        </div>
        <CompetitorReport report={report} />
      </main>
    </div>
  );
}