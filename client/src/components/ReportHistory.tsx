import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";
import { useLocation } from "wouter";

interface ReportHistoryProps {
  reports: Array<{
    id: string;
    title: string;
    competitors: string[];
    createdAt: string;
  }>;
  isLoading: boolean;
  onLoadReport: (report: any) => void;
}

export default function ReportHistory({ reports, isLoading, onLoadReport }: ReportHistoryProps) {
  const [, setLocation] = useLocation();

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      return 'Less than an hour ago';
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="card-report-history">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recent Reports</h3>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded-md"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-report-history">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Recent Reports</h3>
        
        {reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No reports yet</p>
            <p className="text-xs text-muted-foreground">Generate your first competitor analysis to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.slice(0, 5).map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md hover:bg-accent transition-colors cursor-pointer"
                onClick={() => setLocation(`/report/${report.id}`)}
                data-testid={`report-item-${report.id}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground" data-testid={`text-report-title-${report.id}`}>
                    {report.title}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid={`text-report-meta-${report.id}`}>
                    {formatTimeAgo(report.createdAt)} • {report.competitors.length} competitors
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(`/report/${report.id}`);
                  }}
                  data-testid={`button-view-report-${report.id}`}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        
        {reports.length > 5 && (
          <Button 
            variant="ghost" 
            className="w-full mt-4 text-sm text-primary hover:text-primary/80"
            data-testid="button-view-all-reports"
          >
            View all reports
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
