import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Share, BarChart3, DollarSign, MessageCircle, Lightbulb, CheckCircle, TrendingUp, TrendingDown, Minus, Building2, Target, Code, Globe, Package, Users, ThumbsUp, ThumbsDown, AlertTriangle, Zap } from "lucide-react";

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
      // Try to parse as JSON first
      try {
        analysis = JSON.parse(report.summary);
      } catch {
        // If parsing fails, treat as plain text and create structure
        analysis = {
          executive_summary: report.summary,
          competitor_insights: [],
          market_signals: [],
          recommendations: []
        };
      }
    } else if (typeof report.summary === 'object' && report.summary !== null) {
      analysis = report.summary;
    } else {
      throw new Error('Invalid summary format');
    }
    
    // Ensure required fields exist
    if (!analysis.executive_summary) {
      analysis.executive_summary = "Competitive intelligence analysis completed. Key insights and market signals have been identified.";
    }
  } catch (error) {
    console.error("Error parsing report summary:", error);
    analysis = {
      executive_summary: "Competitive intelligence analysis completed. Key insights and market signals have been identified.",
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

  const renderSection = (title: string, icon: React.ReactNode, content: any, emptyMessage = "No reliable data found") => {
    if (!content || (Array.isArray(content) && content.length === 0) || content === "No reliable data found") {
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

    return (
      <div>
        <h4 className="font-medium text-foreground mb-3 flex items-center">
          {icon}
          {title}
        </h4>
        {Array.isArray(content) ? (
          <ul className="space-y-2 text-sm">
            {content.map((item: string, itemIndex: number) => (
              <li key={itemIndex} className="flex items-start">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground">{content}</p>
        )}
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-pdf"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button
              variant="outline"
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

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
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
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-foreground"><strong>Sentiment:</strong> {competitor.customer_insights?.sentiment || "No reliable data found"}</p>
                          </div>
                          <div>
                            <div>
                              <strong className="text-sm">Pain Points:</strong>
                              {competitor.customer_insights?.pain_points ? (
                                <ul className="mt-2 space-y-1">
                                  {competitor.customer_insights.pain_points.map((item: string, idx: number) => (
                                    <li key={idx} className="text-sm text-foreground flex items-start">
                                      <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-muted-foreground italic mt-2">No reliable data found</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="market" className="space-y-6 mt-6">
                  {/* Target Market & Competitive Position */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      {renderSection("Target Market", <Target className="w-4 h-4 text-cyan-600 mr-2" />,
                        <>
                          <p className="text-sm text-foreground mb-2"><strong>Primary Segments:</strong> {competitor.target_market?.primary_segments || "No reliable data found"}</p>
                          <p className="text-sm text-foreground"><strong>Competitive Position:</strong> {competitor.target_market?.competitive_position || "No reliable data found"}</p>
                        </>
                      )}
                    </div>

                    <div>
                      {renderSection("Market Presence", <Globe className="w-4 h-4 text-emerald-600 mr-2" />,
                        <>
                          <p className="text-sm text-foreground mb-2"><strong>Market Share:</strong> {competitor.market_presence?.market_share || "No reliable data found"}</p>
                          <p className="text-sm text-foreground mb-2"><strong>Geographic Reach:</strong> {competitor.market_presence?.geographic_reach || "No reliable data found"}</p>
                          <p className="text-sm text-foreground"><strong>Target Audience:</strong> {competitor.market_presence?.target_audience || "No reliable data found"}</p>
                        </>
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
                          <p className="text-sm text-foreground mb-2"><strong>Tech Stack:</strong> {competitor.tech_assessment?.tech_stack || "No reliable data found"}</p>
                          <p className="text-sm text-foreground"><strong>Innovation Level:</strong> {competitor.tech_assessment?.innovation_level || "No reliable data found"}</p>
                        </>
                      )}
                    </div>

                    <div>
                      {renderSection("Tech & Innovation", <Zap className="w-4 h-4 text-yellow-600 mr-2" />,
                        <>
                          <p className="text-sm text-foreground mb-2"><strong>Patents & R&D:</strong> {competitor.tech_innovation?.patents_rd || "No reliable data found"}</p>
                          <p className="text-sm text-foreground"><strong>Key Innovations:</strong> {competitor.tech_innovation?.differentiating_innovations || "No reliable data found"}</p>
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
                  <span className="text-foreground">{insight}</span>
                </li>
              ))}
            </ul>
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
