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
      <Card data-testid="card-report-history" className="card-rounded">
        <CardContent className="p-6">
          <h2 className="text-foreground mb-4">Recent Reports</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded-xl"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-report-history" className="card-rounded hover-lift">
      <CardContent className="p-6">
        <h2 className="text-foreground mb-4">Recent Reports</h2>
        
        {reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-medium text-foreground mb-2">No reports yet</p>
            <p className="text-sm text-muted-foreground">Generate your first competitor analysis to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.slice(0, 5).map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-4 bg-muted rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-200 cursor-pointer group"
                onClick={() => setLocation(`/report/${report.id}`)}
                data-testid={`report-item-${report.id}`}
              >
                <div className="flex-1">
                  <p className="font-medium group-hover:text-primary-foreground" data-testid={`text-report-title-${report.id}`}>
                    {report.title}
                  </p>
                  <p className="text-sm text-muted-foreground group-hover:text-primary-foreground/80" data-testid={`text-report-meta-${report.id}`}>
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
                  className="group-hover:text-primary-foreground group-hover:hover:bg-primary-foreground/10"
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
            className="w-full mt-4 text-primary hover:bg-primary hover:text-primary-foreground font-medium rounded-xl transition-colors"
            data-testid="button-view-all-reports"
          >
            View all reports
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
