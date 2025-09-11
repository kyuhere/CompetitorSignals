import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Share, Mail, BarChart3, DollarSign, MessageCircle, Lightbulb, CheckCircle, TrendingUp, TrendingDown, Minus, Building2, Target, Code, Globe, Package, Users, ThumbsUp, ThumbsDown, AlertTriangle, Zap, ExternalLink } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";

interface CompetitorReportProps {
  report: {
    id: string;
    title: string;
    competitors: string[];
    summary: string;
    signals?: Array<{
      source: string;
      competitor: string;
      items: Array<{
        title: string;
        content: string;
        url?: string;
        publishedAt?: string;
        type: 'news' | 'funding' | 'social' | 'product';
      }>;
    }>;
    metadata: {
      signalCount: number;
      sources: string[];
      generatedAt: string;
      hasRedditAnalysis?: boolean;
      redditSentiment?: {
        query: string;
        posts: Array<{
          title: string;
          subreddit: string;
          comments: number;
          summary: string;
          url?: string;
          permalink: string;
          quotes?: string[];
        }>;
        overallSentiment: string;
      };
      enhanced?: {
        reviewData: Array<{
          competitor: string;
          g2?: {
            platform: 'g2';
            averageRating?: number;
            totalReviews?: number;
            sentiment: 'positive' | 'neutral' | 'negative';
            sentimentScore: number;
            topQuotes: Array<{
              text: string;
              url?: string;
            }>;
            summary: string;
          };
          trustpilot?: {
            platform: 'trustpilot';
            averageRating?: number;
            totalReviews?: number;
            sentiment: 'positive' | 'neutral' | 'negative';
            sentimentScore: number;
            topQuotes: Array<{
              text: string;
              url?: string;
              rating?: number;
            }>;
            summary: string;
          };
          hackerNews?: {
            platform: 'hackernews';
            totalMentions?: number;
            sentiment: 'positive' | 'neutral' | 'negative';
            sentimentScore: number;
            topQuotes: Array<{
              text: string;
              author?: string;
              url?: string;
            }>;
            summary: string;
          };
        }>;
        hasG2Reviews: boolean;
        hasHNSentiment: boolean;
        locked?: boolean;
      };
    };
    createdAt: string;
  };
}

export default function CompetitorReport({ report }: CompetitorReportProps) {
  const { toast } = useToast();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  // Track active tab and render heavy sections on demand
  const [activeTab, setActiveTab] = useState<"overview" | "analysis" | "reviews" | "market" | "tech">("overview");

  // Email mutation
  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', `/api/reports/${report.id}/email`, { email });
    },
    onSuccess: () => {
      toast({
        title: "📧 Email Sent!",
        description: "Your competitor analysis report has been sent to your email address.",
      });
      setEmailDialogOpen(false);
      setEmailAddress("");
    },
    onError: (error: Error) => {
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEmailReport = () => {
    if (emailAddress.trim() && emailAddress.includes('@')) {
      emailMutation.mutate(emailAddress.trim());
    } else {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
    }
  };

  // Parse report summary
  const analysis = useMemo(() => {
    try {
      // Handle both string and object formats
      if (typeof report.summary === 'string') {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(report.summary);
          return {
            executive_summary: parsed.executive_summary || "Competitive intelligence analysis completed. Key insights and market signals have been identified.",
            competitors: parsed.competitors || [],
            competitor_insights: parsed.competitor_insights || [],
            market_signals: parsed.market_signals || [],
            recommendations: parsed.recommendations || [],
            strategic_insights: parsed.strategic_insights || [],
            methodology: parsed.methodology || null
          };
        } catch {
          // If parsing fails, treat as plain text and create structure
          return {
            executive_summary: report.summary,
            competitors: [],
            competitor_insights: [],
            market_signals: [],
            recommendations: [],
            strategic_insights: [],
            methodology: null
          };
        }
      } else if (typeof report.summary === 'object' && report.summary !== null) {
        const summaryObj = report.summary as any;
        return {
          executive_summary: summaryObj.executive_summary || "Competitive intelligence analysis completed. Key insights and market signals have been identified.",
          competitors: summaryObj.competitors || [],
          competitor_insights: summaryObj.competitor_insights || [],
          market_signals: summaryObj.market_signals || [],
          recommendations: summaryObj.recommendations || [],
          strategic_insights: summaryObj.strategic_insights || [],
          methodology: summaryObj.methodology || null
        };
      } else {
        throw new Error('Invalid summary format');
      }
    } catch (error) {
      console.error("Error parsing report summary:", error);
      return {
        executive_summary: "Competitive intelligence analysis completed. Key insights and market signals have been identified.",
        competitors: [],
        competitor_insights: [],
        market_signals: [],
        recommendations: [],
        strategic_insights: [],
        methodology: null
      };
    }
  }, [report.summary]);

  const handleExport = async () => {
    try {
      // Dynamically import heavy libraries only when exporting
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas")
      ]);
      // Find the report content element
      const reportElement = document.querySelector('[data-testid="card-competitor-report"]') as HTMLElement;
      if (!reportElement) {
        console.error('Report element not found');
        return;
      }

      // Create canvas from the report element
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // Calculate dimensions
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;

      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download the PDF
      const fileName = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_analysis.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
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

  // Helper to strip any trailing inline source tags like "[Source: bing.com/news]"
  const stripSourceTags = (s: string) => (s || '').replace(/\s*\[source:[^\]]*\]/gi, '').trim();

  const renderSection = (title: string, icon: React.ReactNode, content: any, emptyMessage = "No reliable data found") => {
    const isNoDataString = (val: unknown) => typeof val === 'string' && val.trim().toLowerCase() === 'no reliable data found';

    if (
      content == null ||
      (typeof content === 'string' && isNoDataString(content)) ||
      (Array.isArray(content) && content.filter((i) => !isNoDataString(i)).length === 0)
    ) {
      return (
        <div>
          <h4 className="font-medium text-foreground mb-3 flex items-center">
            {icon}
            {title}
          </h4>
          <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>
        </div>
      );
    }

    if (Array.isArray(content)) {
      const filtered = content.filter((i) => !isNoDataString(i));
      return (
        <div>
          <h4 className="font-medium text-foreground mb-3 flex items-center">
            {icon}
            {title}
          </h4>
          <ul className="space-y-2 text-sm">
            {filtered.map((item: string, itemIndex: number) => (
              <li key={itemIndex} className="flex items-start">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span className="text-foreground">{stripSourceTags(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <div>
        <h4 className="font-medium text-foreground mb-3 flex items-center">
          {icon}
          {title}
        </h4>
        <div className="text-sm text-foreground">{typeof content === 'string' ? stripSourceTags(content) : content}</div>
      </div>
    );
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
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-email-report"
                  className="btn-glass-secondary"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email Report
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>📧 Email Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEmailReport();
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setEmailDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleEmailReport}
                      disabled={emailMutation.isPending}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      {emailMutation.isPending ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-pdf"
              className="btn-glass-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              data-testid="button-share"
              className="btn-glass-secondary"
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

        {/* Comprehensive Competitor Analysis */}
        <div className="space-y-8">
          {analysis.competitors?.map((competitor: any, index: number) => (
            <div key={index} className="border border-border rounded-lg p-6" data-testid={`competitor-analysis-${index}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-foreground" data-testid={`text-competitor-name-${index}`}>
                  {competitor.competitor}
                </h3>
                <div className="flex items-center space-x-2">
                  {getActivityBadge(competitor.activity_level)}
                  <span className="text-xs text-muted-foreground">
                    {(competitor.recent_developments?.length || 0) + (competitor.funding_business?.length || 0)} signals
                  </span>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger value="market">Market</TabsTrigger>
                  <TabsTrigger value="tech">Tech & Innovation</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-8 mt-6">
                  {/* Company Overview */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="font-medium text-foreground mb-3 flex items-center">
                          <Building2 className="w-4 h-4 text-blue-600 mr-2" />
                          Company Overview
                        </h4>
                        <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1">Location</p>
                            <p className="text-sm text-muted-foreground">{competitor.company_overview?.location || "No reliable data found"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1">Market Position</p>
                            <p className="text-sm text-muted-foreground">{competitor.company_overview?.market_positioning || "No reliable data found"}</p>
                          </div>
                        </div>
                        {competitor.company_overview?.key_products_services && (
                          <div>
                            <p className="text-sm font-medium text-foreground mb-3">Key Products & Services</p>
                            <ul className="space-y-2">
                              {competitor.company_overview.key_products_services.slice(0, 4).map((item: string, idx: number) => (
                                <li key={idx} className="text-sm text-foreground flex items-start">
                                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium text-foreground mb-3 flex items-center">
                          <Package className="w-4 h-4 text-purple-600 mr-2" />
                          Products & Services
                        </h4>
                        <div className="space-y-4">
                          {competitor.products_services?.main_offerings && (
                            <div className="bg-muted/50 p-4 rounded-lg">
                              <p className="text-sm font-medium text-foreground mb-2">Main Offerings</p>
                              <ul className="space-y-2">
                                {competitor.products_services.main_offerings.slice(0, 3).map((item: string, idx: number) => (
                                  <li key={idx} className="text-sm text-foreground flex items-start">
                                    <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {competitor.products_services?.unique_selling_points && (
                            <div className="bg-muted/50 p-4 rounded-lg">
                              <p className="text-sm font-medium text-foreground mb-2">Unique Selling Points</p>
                              <ul className="space-y-2">
                                {competitor.products_services.unique_selling_points.slice(0, 3).map((item: string, idx: number) => (
                                  <li key={idx} className="text-sm text-foreground flex items-start">
                                    <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Strategy */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-foreground mb-3 flex items-center">
                      <DollarSign className="w-4 h-4 text-green-600 mr-2" />
                      Pricing Strategy
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-foreground">Pricing Models</p>
                        <p className="text-sm text-muted-foreground">{competitor.pricing_strategy?.pricing_models || "No reliable data found"}</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-foreground">Strategy</p>
                        <p className="text-sm text-muted-foreground">{competitor.pricing_strategy?.general_strategy || "No reliable data found"}</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-foreground">Promotions</p>
                        <p className="text-sm text-muted-foreground">{competitor.pricing_strategy?.promotions_offers || "No reliable data found"}</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="analysis" className="space-y-8 mt-6">
                  {/* Strengths vs Weaknesses */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-green-50 dark:bg-green-950 p-6 rounded-lg">
                      <h4 className="font-medium text-foreground mb-4 flex items-center">
                        <ThumbsUp className="w-4 h-4 text-green-600 mr-2" />
                        Key Strengths
                      </h4>
                      {competitor.strengths_weaknesses?.strengths ? (
                        <ul className="space-y-3">
                          {competitor.strengths_weaknesses.strengths.slice(0, 5).map((item: string, idx: number) => (
                            <li key={idx} className="text-sm text-foreground flex items-start">
                              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No reliable data found</p>
                      )}
                    </div>
                    <div className="bg-red-50 dark:bg-red-950 p-6 rounded-lg">
                      <h4 className="font-medium text-foreground mb-4 flex items-center">
                        <ThumbsDown className="w-4 h-4 text-red-600 mr-2" />
                        Areas for Improvement
                      </h4>
                      {competitor.strengths_weaknesses?.weaknesses ? (
                        <ul className="space-y-3">
                          {competitor.strengths_weaknesses.weaknesses.slice(0, 5).map((item: string, idx: number) => (
                            <li key={idx} className="text-sm text-foreground flex items-start">
                              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No reliable data found</p>
                      )}
                    </div>
                  </div>

                  {/* SWOT Analysis */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg">
                      <h4 className="font-medium text-foreground mb-4 flex items-center">
                        <Zap className="w-4 h-4 text-blue-600 mr-2" />
                        Market Opportunities
                      </h4>
                      {competitor.swot_analysis?.opportunities ? (
                        <ul className="space-y-3">
                          {competitor.swot_analysis.opportunities.slice(0, 4).map((item: string, idx: number) => (
                            <li key={idx} className="text-sm text-foreground flex items-start">
                              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No reliable data found</p>
                      )}
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950 p-6 rounded-lg">
                      <h4 className="font-medium text-foreground mb-4 flex items-center">
                        <AlertTriangle className="w-4 h-4 text-orange-600 mr-2" />
                        Market Threats
                      </h4>
                      {competitor.swot_analysis?.threats ? (
                        <ul className="space-y-3">
                          {competitor.swot_analysis.threats.slice(0, 4).map((item: string, idx: number) => (
                            <li key={idx} className="text-sm text-foreground flex items-start">
                              <div className="w-1.5 h-1.5 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No reliable data found</p>
                      )}
                    </div>
                  </div>

                  {/* Customer Insights */}
                  <div>
                    {renderSection("Customer Insights", <Users className="w-4 h-4 text-indigo-600 mr-2" />,
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-foreground"><strong>Sentiment:</strong> {competitor.customer_insights?.sentiment || "No reliable data found"}</div>
                        </div>
                        <div>
                          <div>
                            <div className="text-sm font-medium text-foreground mb-2">Pain Points:</div>
                            {competitor.customer_insights?.pain_points ? (
                              <ul className="space-y-1">
                                {competitor.customer_insights.pain_points.map((item: string, idx: number) => (
                                  <li key={idx} className="text-sm text-foreground flex items-start">
                                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-sm text-muted-foreground italic">No reliable data found</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="reviews" className="space-y-6 mt-6">
                  {activeTab !== 'reviews' ? null : (
                    <>
                    {/* Reviews & Sentiment Analysis */}
                    {(() => {
                      const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      const reviewDataList = report.metadata?.enhanced?.reviewData || [];
                      const targetName = competitor.competitor;
                      const enhancedData = reviewDataList.find((d: any) => normalize(d.competitor) === normalize(targetName))
                        || reviewDataList.find((d: any) => {
                          const a = normalize(d.competitor);
                          const b = normalize(targetName);
                          return a.includes(b) || b.includes(a);
                        });
                      if (!enhancedData) {
                        return (
                          <div className="bg-muted/50 p-6 rounded-lg text-center">
                            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <h4 className="font-medium text-foreground mb-2">Enhanced Reviews & Sentiment</h4>
                            <p className="text-sm text-muted-foreground">
                              Premium review and social sentiment analysis is available for logged-in users.
                            </p>
                          </div>
                        );
                      }
                      const reviewsData = enhancedData?.trustpilot || enhancedData?.g2;
                      const hnData = enhancedData?.hackerNews;
                      const rawLocked = (report as any)?.metadata?.enhanced?.locked as unknown;
                      const isLocked = rawLocked === true || rawLocked === 'true';

                    return (
                      <div className="relative">
                        <div className={`space-y-6 ${isLocked ? 'blur-sm pointer-events-none select-none' : ''}`}>
                          {/* Reviews Section (Trustpilot or legacy G2) */}
                          {reviewsData && (
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 p-6 rounded-lg">
                              <h4 className="font-medium text-foreground mb-4 flex items-center">
                                <BarChart3 className="w-4 h-4 text-blue-600 mr-2" />
                                Reviews
                              </h4>
                              <p className="text-xs text-muted-foreground mb-4">Reviews are sourced from Trustpilot when a company domain is provided.</p>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                  <div className="text-2xl font-bold text-foreground">{reviewsData.averageRating?.toFixed(1) || 'N/A'}</div>
                                  <div className="text-sm text-muted-foreground">Average Rating</div>
                                  <div className="flex justify-center mt-2">
                                    {Array.from({length: 5}, (_, i) => (
                                      <div
                                        key={i}
                                        className={`w-3 h-3 rounded-full mx-0.5 ${
                                          i < Math.floor(reviewsData.averageRating || 0) ? 'bg-yellow-400' : 'bg-gray-300'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                  <div className="text-2xl font-bold text-foreground">{reviewsData.totalReviews || 0}</div>
                                  <div className="text-sm text-muted-foreground">Total Reviews</div>
                                </div>

                                <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                  <div className={`text-2xl font-bold ${
                                    reviewsData.sentiment === 'positive' ? 'text-green-600' : 
                                    reviewsData.sentiment === 'negative' ? 'text-red-600' : 'text-yellow-600'
                                  }`}>
                                    {reviewsData.sentiment === 'positive' ? '😊' : reviewsData.sentiment === 'negative' ? '😞' : '😐'}
                                  </div>
                                  <div className="text-sm text-muted-foreground">Overall Sentiment</div>
                                  <div className="text-xs text-muted-foreground mt-1">{reviewsData.sentimentScore}/100</div>
                              </div>
                            </div>

                            {reviewsData.topQuotes?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-foreground mb-3">Top Review Quotes</h5>
                                <div className="space-y-3">
                                  {reviewsData.topQuotes.slice(0, 3).map((quote: any, idx: number) => (
                                    <div key={idx} className="bg-white/50 dark:bg-black/30 p-3 rounded border-l-4 border-blue-500">
                                      <p className="text-sm text-foreground italic">"{quote.text}"</p>
                                      {quote.url && (
                                        <a
                                          href={quote.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center"
                                          data-testid={`link-review-${idx}`}
                                        >
                                          {reviewsData.platform === 'g2' ? 'View on G2' : 'View on Trustpilot'} <ExternalLink className="w-3 h-3 ml-1" />
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-4 p-3 bg-white/50 dark:bg-black/30 rounded">
                              <div className="text-sm text-foreground">{reviewsData.summary}</div>
                            </div>
                          </div>
                        )}

                        {/* Hacker News Sentiment Section */}
                        {hnData && (
                          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 p-6 rounded-lg">
                            <h4 className="font-medium text-foreground mb-4 flex items-center">
                              <MessageCircle className="w-4 h-4 text-orange-600 mr-2" />
                              Hacker News Social Sentiment
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                              <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                <div className="text-2xl font-bold text-foreground">{hnData.totalMentions || 0}</div>
                                <div className="text-sm text-muted-foreground">Mentions Found</div>
                              </div>

                              <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                <div className={`text-2xl font-bold ${
                                  hnData.sentiment === 'positive' ? 'text-green-600' : 
                                  hnData.sentiment === 'negative' ? 'text-red-600' : 'text-yellow-600'
                                }`}>
                                  {hnData.sentiment === 'positive' ? <TrendingUp className="w-6 h-6 mx-auto" /> : 
                                   hnData.sentiment === 'negative' ? <TrendingDown className="w-6 h-6 mx-auto" /> : 
                                   <Minus className="w-6 h-6 mx-auto" />}
                                </div>
                                <div className="text-sm text-muted-foreground">Sentiment Trend</div>
                                <div className="text-xs text-muted-foreground mt-1">{hnData.sentimentScore}/100</div>
                              </div>

                              <div className="bg-white/50 dark:bg-black/30 p-4 rounded-lg text-center">
                                <div className="text-lg font-bold text-foreground">HN</div>
                                <div className="text-sm text-muted-foreground">Data Source</div>
                              </div>
                            </div>

                            {hnData.topQuotes?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-foreground mb-3">Top Discussion Quotes</h5>
                                <div className="space-y-3">
                                  {hnData.topQuotes.slice(0, 3).map((quote: any, idx: number) => (
                                    <div key={idx} className="bg-white/50 dark:bg-black/30 p-3 rounded border-l-4 border-orange-500">
                                      <p className="text-sm text-foreground italic">"{quote.text}"</p>
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-xs text-muted-foreground">by {quote.author || 'Anonymous'}</span>
                                        {quote.url && (
                                          <a
                                            href={quote.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-orange-600 hover:underline inline-flex items-center"
                                            data-testid={`link-hn-comment-${idx}`}
                                          >
                                            View on HN <ExternalLink className="w-3 h-3 ml-1" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-4 p-3 bg-white/50 dark:bg-black/30 rounded">
                              <div className="text-sm text-foreground">{hnData.summary}</div>
                            </div>
                          </div>
                        )}

                        {/* No Enhanced Data Available */}
                        {!reviewsData && !hnData && (
                          <div className="bg-muted/50 p-6 rounded-lg text-center">
                            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <h4 className="font-medium text-foreground mb-2">Enhanced Reviews & Sentiment</h4>
                            <p className="text-xs text-muted-foreground mb-2">For reviews, include the company's domain (e.g., openai.com). Other insights work with names.</p>
                            <p className="text-sm text-muted-foreground">Upgrade to premium for deeper review analysis and sentiment insights</p>
                          </div>
                        )}
                        </div>

                        {isLocked && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-background/90 backdrop-blur-md border border-border rounded-xl p-6 text-center max-w-md shadow-xl">
                              <h4 className="text-lg font-bold text-foreground mb-2">Premium Feature</h4>
                              <p className="text-sm text-muted-foreground mb-4">Upgrade to unlock Reviews & Social Sentiment for this analysis.</p>
                              <Button className="btn-primary px-6">Upgrade</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })()}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="market" className="space-y-6 mt-6">
                  {/* Target Market & Competitive Position */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      {renderSection("Target Market", <Target className="w-4 h-4 text-cyan-600 mr-2" />,
                        <>
                          <div className="space-y-2">
                            <div className="text-sm text-foreground"><strong>Primary Segments:</strong> {competitor.target_market?.primary_segments || "No reliable data found"}</div>
                            <div className="text-sm text-foreground"><strong>Competitive Position:</strong> {competitor.target_market?.competitive_position || "No reliable data found"}</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div>
                      {renderSection("Market Presence", <Globe className="w-4 h-4 text-emerald-600 mr-2" />,
                        <div className="space-y-2">
                          <div className="text-sm text-foreground"><strong>Market Share:</strong> {competitor.market_presence?.market_share || "No reliable data found"}</div>
                          <div className="text-sm text-foreground"><strong>Geographic Reach:</strong> {competitor.market_presence?.geographic_reach || "No reliable data found"}</div>
                          <div className="text-sm text-foreground"><strong>Target Audience:</strong> {competitor.market_presence?.target_audience || "No reliable data found"}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Developments & Funding */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      {renderSection("Recent Developments", <BarChart3 className="w-4 h-4 text-primary mr-2" />, 
                        competitor.recent_developments
                      )}
                    </div>
                    <div>
                      {renderSection("Funding & Business", <DollarSign className="w-4 h-4 text-green-600 mr-2" />, 
                        competitor.funding_business
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="tech" className="space-y-6 mt-6">
                  {/* Tech Assessment */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      {renderSection("Tech Assessment", <Code className="w-4 h-4 text-slate-600 mr-2" />,
                        <>
                          <div className="space-y-2">
                            <div className="text-sm text-foreground"><strong>Tech Stack:</strong> {competitor.tech_assessment?.tech_stack || "No reliable data found"}</div>
                            <div className="text-sm text-foreground"><strong>Innovation Level:</strong> {competitor.tech_assessment?.innovation_level || "No reliable data found"}</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div>
                      {renderSection("Tech & Innovation", <Zap className="w-4 h-4 text-yellow-600 mr-2" />,
                        <>
                          <div className="space-y-2">
                            <div className="text-sm text-foreground"><strong>Patents & R&D:</strong> {competitor.tech_innovation?.patents_rd || "No reliable data found"}</div>
                            <div className="text-sm text-foreground"><strong>Key Innovations:</strong> {competitor.tech_innovation?.differentiating_innovations || "No reliable data found"}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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
                  <span className="text-foreground">{stripSourceTags(insight)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Source References */}
        {report.signals && report.signals.length > 0 && (
          <div className="mt-8 p-6 bg-muted/50 rounded-lg">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <Globe className="w-5 h-5 text-blue-600 mr-2" />
              Source References
            </h3>
            <div className="space-y-4">
              {report.signals.map((signal, signalIndex) => {
                // Clean up source names and make them clickable if they're RSS feeds
                let displaySource = signal.source;
                let sourceUrl = null;

                if (signal.source === 'RapidAPI News') {
                  displaySource = 'News';
                } else if (signal.source.includes('RSS: bing.com')) {
                  displaySource = 'Bing News';
                  sourceUrl = 'https://www.bing.com/news';
                } else if (signal.source.includes('RSS:')) {
                  // Extract hostname from RSS source
                  const match = signal.source.match(/RSS: (.+)/);
                  if (match) {
                    displaySource = match[1];
                    // Try to create a link to the source
                    if (match[1].includes('techcrunch')) {
                      sourceUrl = 'https://techcrunch.com';
                    } else if (match[1].includes('ycombinator')) {
                      sourceUrl = 'https://news.ycombinator.com';
                    }
                  }
                }

                return (
                <div key={signalIndex} className="border-l-2 border-blue-200 pl-4">
                  <h4 className="font-medium text-foreground mb-2">
                    {sourceUrl ? (
                      <a 
                        href={sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {displaySource}
                      </a>
                    ) : displaySource === 'Aggregated Sources' ? (
                      <div className="space-y-1">
                        <span className="text-foreground font-medium">Multiple Sources:</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <a 
                            href="https://techcrunch.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full hover:bg-blue-200 transition-colors"
                          >
                            TechCrunch
                          </a>
                          <a 
                            href="https://news.ycombinator.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full hover:bg-orange-200 transition-colors"
                          >
                            Hacker News
                          </a>
                          <a 
                            href="https://www.bing.com/news" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full hover:bg-green-200 transition-colors"
                          >
                            Bing News
                          </a>
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                            RSS Feeds
                          </span>
                        </div>
                      </div>
                    ) : (
                      displaySource
                    )}
                  </h4>
                  <div className="space-y-2">
                    {signal.items.filter(item => item.url).slice(0, 5).map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-start space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            data-testid={`source-link-${signalIndex}-${itemIndex}`}
                          >
                            {item.title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}
                          </a>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''} • {item.type}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <strong>Total Sources:</strong> {report.signals.reduce((acc, signal) => acc + signal.items.filter(item => item.url).length, 0)} articles and references analyzed
              </p>
            </div>
          </div>
        )}

        {/* Report Footer */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Report generated by AI Competitor Signals
            </p>
            <div className="flex flex-wrap justify-center items-center gap-2 text-xs text-muted-foreground">
              <span>Data sources:</span>
              {analysis.methodology?.sources_analyzed?.length > 0 ? (
                analysis.methodology.sources_analyzed.map((source: string, idx: number) => (
                  <span key={idx}>
                    {source.startsWith('http') ? (
                      <a 
                        href={source} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 underline"
                        data-testid={`source-link-${idx}`}
                      >
                        {new URL(source).hostname}
                      </a>
                    ) : (
                      <span className="text-primary">{source}</span>
                    )}
                    {idx < analysis.methodology.sources_analyzed.length - 1 && <span className="mx-1">•</span>}
                  </span>
                ))
              ) : (
                <span>TechCrunch, Hacker News, RapidAPI News, Multiple RSS feeds</span>
              )}
            </div>
            <div>
              <Button 
                variant="link" 
                className="p-0 h-auto text-xs text-primary hover:text-primary/80 underline" 
                data-testid="button-methodology"
                onClick={() => window.open('https://github.com/replit/ai-competitor-signals#methodology', '_blank')}
              >
                View methodology
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}