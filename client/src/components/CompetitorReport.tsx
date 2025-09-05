import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Share, BarChart3, DollarSign, MessageCircle, Lightbulb, CheckCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CompetitorReportProps {
  report: {
    id: string;
    title: string;
    competitors: string[];
    summary: string;
    metadata: {
      signalCount: number;
      sources: string[];
      generatedAt: string;
    };
    createdAt: string;
  };
}

export default function CompetitorReport({ report }: CompetitorReportProps) {
  let analysis;
  try {
    // Handle both string and object formats
    if (typeof report.summary === 'string') {
      analysis = JSON.parse(report.summary);
    } else if (typeof report.summary === 'object' && report.summary !== null) {
      analysis = report.summary;
    } else {
      throw new Error('Invalid summary format');
    }
  } catch (error) {
    console.error("Error parsing report summary:", error);
    analysis = {
      executive_summary: "Analysis results are being processed. Please try generating a new report.",
      competitor_insights: [],
      market_signals: [],
      recommendations: []
    };
  }

  const handleExport = () => {
    // TODO: Implement PDF export
    console.log("Export PDF functionality");
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    navigator.clipboard.writeText(window.location.href);
  };

  const getActivityIcon = (level: string) => {
    switch (level) {
      case 'high':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'moderate':
        return <Minus className="w-4 h-4 text-yellow-600" />;
      case 'low':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivityBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">High Activity</Badge>;
      case 'moderate':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Moderate Activity</Badge>;
      case 'low':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Low Activity</Badge>;
      default:
        return <Badge variant="secondary">Unknown Activity</Badge>;
    }
  };


  return (
    <Card data-testid="card-competitor-report">
      {/* Report Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-report-title">
              {report.title}
            </h1>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span data-testid="text-report-date">
                Generated: {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'Now'} at {report.createdAt ? new Date(report.createdAt).toLocaleTimeString() : 'Now'}
              </span>
              <span>•</span>
              <span data-testid="text-competitor-count">
                {report.competitors?.length || 0} Competitors Analyzed
              </span>
              <span>•</span>
              <span data-testid="text-signal-count">
                {report.metadata?.signalCount || 0} Signals Processed
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-pdf"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShare}
              data-testid="button-share"
            >
              <Share className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <CardContent className="p-6">
        {/* Executive Summary */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 text-primary mr-2" />
            Executive Summary
          </h2>
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-foreground leading-relaxed" data-testid="text-executive-summary">
              {analysis.executive_summary}
            </p>
          </div>
        </div>

        {/* Competitor Analysis */}
        <div className="space-y-8">
          {analysis.competitors?.map((competitor: any, index: number) => (
            <div key={index} className="border border-border rounded-lg p-6" data-testid={`competitor-analysis-${index}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-foreground" data-testid={`text-competitor-name-${index}`}>
                  {competitor.competitor}
                </h3>
                <div className="flex items-center space-x-2">
                  {getActivityBadge(competitor.activity_level)}
                  <span className="text-xs text-muted-foreground">
                    {competitor.recent_developments?.length + competitor.funding_business?.length || 0} signals
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent Developments */}
                <div>
                  <h4 className="font-medium text-foreground mb-3 flex items-center">
                    <BarChart3 className="w-4 h-4 text-primary mr-2" />
                    Recent Developments
                  </h4>
                  <ul className="space-y-2 text-sm">
                    {competitor.recent_developments?.map((item: string, itemIndex: number) => (
                      <li key={itemIndex} className="flex items-start" data-testid={`development-${index}-${itemIndex}`}>
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Funding & Business */}
                <div>
                  <h4 className="font-medium text-foreground mb-3 flex items-center">
                    <DollarSign className="w-4 h-4 text-green-600 mr-2" />
                    Funding & Business
                  </h4>
                  <ul className="space-y-2 text-sm">
                    {competitor.funding_business?.map((item: string, itemIndex: number) => (
                      <li key={itemIndex} className="flex items-start" data-testid={`funding-${index}-${itemIndex}`}>
                        <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Social Sentiment */}
              {competitor.social_sentiment && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="font-medium text-foreground mb-2 flex items-center">
                    <MessageCircle className="w-4 h-4 text-blue-600 mr-2" />
                    Social Sentiment
                  </h4>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${competitor.social_sentiment.score}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`sentiment-score-${index}`}>
                        {competitor.social_sentiment.score}% Positive
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground" data-testid={`mentions-count-${index}`}>
                      {competitor.social_sentiment.mentions_count.toLocaleString()} mentions this week
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Key Strategic Insights */}
        {analysis.strategic_insights && (
          <div className="mt-8 p-6 bg-muted rounded-lg">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <Lightbulb className="w-5 h-5 text-amber-500 mr-2" />
              Key Strategic Insights
            </h3>
            <ul className="space-y-3">
              {analysis.strategic_insights.map((insight: string, index: number) => (
                <li key={index} className="flex items-start" data-testid={`strategic-insight-${index}`}>
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                  <span className="text-foreground">{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Report Footer */}
        <div className="mt-8 pt-6 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            Report generated by AI Competitor Signals • 
            Data sources: {analysis.methodology?.sources_analyzed?.join(', ') || 'Multiple sources'} • 
            <Button variant="link" className="p-0 h-auto text-sm text-primary hover:text-primary/80 underline" data-testid="button-methodology">
              View methodology
            </Button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
