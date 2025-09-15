import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Building2, Clock, TrendingUp, Zap, Lock, Crown, FileText } from "lucide-react";
import type { TrackedCompetitor } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UsageData {
  current: number;
  limit: number;
  remaining: number;
  plan: string;
  isLoggedIn: boolean;
}

interface TrackedCompetitorsResponse {
  competitors: TrackedCompetitor[];
  count: number;
  limit: number;
}

// Avatar color palette based on Lemonade design system
const avatarColors = [
  'bg-soft-blue',
  'bg-soft-pink', 
  'bg-peach',
  'bg-mint-green',
  'bg-primary'  // Lemon yellow
];

interface TrackedCompetitorsProps {
  onShowReport?: (report: any) => void;
}

export default function TrackedCompetitors({ onShowReport }: TrackedCompetitorsProps) {
  const [, setLocation] = useLocation();
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockInfo, setLockInfo] = useState<{
    daysRemaining: number;
    unlockDate: string;
    competitorName: string;
  } | null>(null);
  const [showRemovalDialog, setShowRemovalDialog] = useState(false); // State for the removal dialog
  const [showQuickSummary, setShowQuickSummary] = useState(false); // State for quick summary modal
  const [quickSummaryData, setQuickSummaryData] = useState<any>(null); // Store quick summary data
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tracked competitors
  const { data: trackedData, isLoading } = useQuery<TrackedCompetitorsResponse>({
    queryKey: ['/api/competitors/tracked'],
  });

  // Send newsletter now (self) – premium-only convenience trigger
  const sendNewsletterNowMutation = useMutation({
    mutationFn: async (): Promise<any> => {
      const res = await apiRequest('POST', '/api/automation/quick-summary/send/me?force=true', {});
      return res.json();
    },
    onSuccess: async (data) => {
      toast({
        title: "Newsletter Sent",
        description: data?.reportId
          ? "We generated a fresh newsletter and emailed it to you."
          : data?.skipped === 'recent_newsletter_exists'
          ? "Skipped: a newsletter was already sent recently."
          : "Triggered successfully. Check your inbox.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send",
        description: error.message || "Could not send the newsletter",
        variant: "destructive",
      });
    },
  });

  // Fetch usage data to determine user plan
  const { data: usage } = useQuery<UsageData>({
    queryKey: ['/api/usage'],
  });

  // Add competitor mutation
  const addCompetitorMutation = useMutation({
    mutationFn: async (competitorName: string) => {
      return apiRequest('POST', '/api/competitors/tracked', { competitorName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors/tracked'] });
      setNewCompetitorName("");
      setIsAdding(false);
      toast({
        title: "Success!",
        description: "Competitor added to your tracking list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove competitor mutation
  const removeCompetitorMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      return apiRequest('DELETE', `/api/competitors/tracked/${competitorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors/tracked'] });
      toast({
        title: "Removed",
        description: "Competitor removed from your tracking list",
      });
    },
    onError: (error: any) => {
      if (error.locked) {
        const competitor = trackedData?.competitors.find(c => c.id === error.competitorId);
        setLockInfo({
          daysRemaining: error.daysRemaining,
          unlockDate: error.unlockDate,
          competitorName: competitor?.competitorName || "competitor"
        });
        setLockDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Quick Summary mutation
  const quickSummaryMutation = useMutation({
    mutationFn: async (): Promise<any> => {
      const res = await apiRequest('POST', '/api/competitors/tracked/quick-summary?mode=newsletter', {});
      return res.json();
    },
    onSuccess: async (data) => {
      console.log("Quick summary API response:", data);
      // Persisted as a normal report; show inline if parent provided callback
      if (data?.id) {
        try {
          const res = await apiRequest('GET', `/api/reports/${data.id}`);
          const fullReport = await res.json();
          if (onShowReport) {
            onShowReport(fullReport);
            return; // show inline on Home page
          }
        } catch (e) {
          console.warn('Failed to fetch created quick summary report; falling back to modal', e);
        }
      }
      // Fallback: keep modal if no id returned or no parent handler
      setQuickSummaryData(data);
      setShowQuickSummary(true);
      toast({
        title: "Quick Summary Ready!",
        description: "Your competitor quick summary has been generated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate quick summary",
        variant: "destructive",
      });
    },
  });

  const handleAddCompetitor = () => {
    if (!newCompetitorName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a competitor name",
        variant: "destructive",
      });
      return;
    }

    addCompetitorMutation.mutate(newCompetitorName.trim());
  };

  const handleRemoveCompetitor = (competitorId: string, competitorName: string) => {
    // Check if user is on free plan and has reached removal limit
    // For simplicity, assuming a hardcoded limit of 3 removals per month for free plan
    // In a real app, this logic would be more complex, checking against usage data.
    const freeUserRemovalLimit = 3; 
    const currentFreeUserRemovals = trackedData?.competitors.filter(c => c.id !== competitorId).length ?? 0; // Simplified check

    if (usage?.plan === 'free' && currentFreeUserRemovals >= freeUserRemovalLimit) {
      setShowRemovalDialog(true);
    } else {
      removeCompetitorMutation.mutate(competitorId);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCompetitor();
    }
    if (e.key === 'Escape') {
      setIsAdding(false);
      setNewCompetitorName("");
    }
  };

  const canAddMore = trackedData ? trackedData.count < trackedData.limit : true;

  if (isLoading) {
    return (
      <Card data-testid="card-tracked-competitors" className="card-rounded">
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            <Building2 className="w-6 h-6 mr-3 text-primary" />
            Tracked Competitors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-muted rounded-xl"></div>
            <div className="h-16 bg-muted rounded-xl"></div>
            <div className="h-16 bg-muted rounded-xl"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-tracked-competitors" className="card-rounded hover-lift">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-xl font-bold">
            <Building2 className="w-6 h-6 mr-3 text-primary" />
            Tracked Competitors
          </CardTitle>
          <Badge 
            className="bg-primary text-primary-foreground font-bold px-3 py-1 rounded-full inline-flex items-center gap-1 font-mono text-xs sm:text-sm" 
            data-testid="text-competitor-count"
          >
            <span>{trackedData?.count ?? 0}</span>
            <span className="mx-1">/</span>
            <span>{trackedData?.limit ?? 3}</span>
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          Manage your {trackedData?.limit ?? 3} tracked competitors. Each analysis adds competitors to this list, and we'll monitor them automatically.
          {usage?.plan === 'premium' && (
            <span className="font-semibold text-[#7a7a7a]"> Premium users can remove competitors instantly.</span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Competitor List */}
        <div className="space-y-3">
          {trackedData?.competitors?.map((competitor, index) => {
            const initials = competitor.competitorName.split(' ').map(n => n[0]).join('').toUpperCase();
            const colorClass = avatarColors[index % avatarColors.length];

            return (
              <div
                key={competitor.id}
                className="flex items-center justify-between p-4 border border-border rounded-xl bg-card hover-lift"
                data-testid={`competitor-item-${competitor.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colorClass}`}>
                    <span className="text-sm font-bold text-gray-700">{initials}</span>
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg" data-testid={`text-competitor-name-${competitor.id}`}>
                      {competitor.competitorName}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center font-medium">
                      <Clock className="w-3 h-3 mr-1" />
                      Added {new Date(competitor.addedAt!).toLocaleDateString()}
                      {competitor.lastAnalyzedAt && (
                        <span className="ml-2">
                          • Last analyzed {new Date(competitor.lastAnalyzedAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCompetitor(competitor.id, competitor.competitorName)}
                  disabled={removeCompetitorMutation.isPending}
                  data-testid={`button-remove-${competitor.id}`}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          })}

          {(!trackedData?.competitors || trackedData.competitors.length === 0) && (
            <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-xl">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="font-bold text-lg mb-2">No competitors being tracked yet</p>
              <p className="text-sm">Add your first competitor to start monitoring!</p>
            </div>
          )}
        </div>

        {/* Add New Competitor */}
        {isAdding ? (
          <div className="flex space-x-3 p-4 bg-muted/30 rounded-xl">
            <Input
              placeholder="Enter competitor name..."
              value={newCompetitorName}
              onChange={(e) => setNewCompetitorName(e.target.value)}
              onKeyDown={handleKeyPress}
              autoFocus
              data-testid="input-new-competitor"
              className="flex-1 rounded-xl border-2 focus:border-primary font-medium"
            />
            <Button
              onClick={handleAddCompetitor}
              disabled={addCompetitorMutation.isPending || !newCompetitorName.trim()}
              data-testid="button-confirm-add"
              className="btn-primary px-6 py-2 text-sm rounded-xl"
            >
              Add
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewCompetitorName("");
              }}
              data-testid="button-cancel-add"
              className="rounded-xl"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setIsAdding(true)}
            disabled={!canAddMore}
            className={canAddMore ? "btn-primary w-full py-4 text-lg" : "w-full py-4 text-lg bg-muted text-muted-foreground"}
            data-testid="button-add-competitor"
          >
            <Plus className="w-5 h-5 mr-2" />
            {canAddMore ? "Add Competitor" : `Limit Reached (${trackedData?.limit || 3} max)`}
          </Button>
        )}

        {/* Quick Summary Button */}
        {trackedData && trackedData.count > 0 && (
          <Button
            onClick={() => quickSummaryMutation.mutate()}
            disabled={quickSummaryMutation.isPending}
            variant="outline"
            className="w-full py-4 text-lg border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-bold rounded-xl"
            data-testid="button-create-quick-summary"
          >
            <Zap className="w-5 h-5 mr-2" />
            {quickSummaryMutation.isPending ? "Creating Summary..." : "Create Quick Summary"}
          </Button>
        )}

        {/* Send Newsletter Now (Premium) */}
        {trackedData && trackedData.count > 0 && usage?.plan === 'premium' && (
          <Button
            onClick={() => sendNewsletterNowMutation.mutate()}
            disabled={sendNewsletterNowMutation.isPending}
            className="w-full py-3 text-base btn-primary rounded-xl"
            data-testid="button-send-newsletter-now"
          >
            {sendNewsletterNowMutation.isPending ? 'Sending…' : 'Send Newsletter Now'}
          </Button>
        )}

        {/* Weekly Analysis Notice */}
        {trackedData && trackedData.count > 0 && (
          <div className="mt-4 p-4 bg-soft-green border-2 border-primary/20 rounded-xl">
            <p className="text-sm text-gray-800 font-medium flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              Automatic analysis every two weeks
            </p>
            <p className="text-xs text-gray-600 mt-1 ml-6">
              We'll keep monitoring the latest competitive intelligence for you
            </p>
          </div>
        )}

        {/* Lock Dialog - Only shown for free users */}
        <AlertDialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
          <AlertDialogContent className="sm:max-w-md card-rounded border-2 border-primary/20 bg-background">
            <AlertDialogHeader className="text-center pb-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg bg-[#feea48]">
                <Lock className="w-10 h-10 text-orange-500" />
              </div>
              <AlertDialogTitle className="text-3xl font-bold text-foreground mb-4">
                Competitor Locked
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base text-muted-foreground leading-relaxed space-y-4">
                <div className="border-2 border-orange-200 rounded-xl p-4 bg-[#feea48]">
                  <p className="font-semibold text-[#000000]">
                    Free plan competitors are locked until month-end to prevent abuse
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-medium text-[#000000]">Unlock in:</span>
                    <span className="text-2xl font-bold text-[#000000]">
                      {lockInfo?.daysRemaining} days
                    </span>
                  </div>
                  <p className="text-sm mt-2 text-[#000000]">
                    Available on {lockInfo?.unlockDate ? new Date(lockInfo.unlockDate).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'N/A'}
                  </p>
                </div>
                <div className="bg-primary/10 border-2 border-primary/20 rounded-xl p-4">
                  <p className="text-foreground font-semibold text-center">
                    ✨ Upgrade to Premium for instant competitor removal
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col gap-3 pt-4">
              <AlertDialogAction 
                onClick={() => {
                  toast({
                    title: "Premium Coming Soon!",
                    description: "Upgrade to premium for instant competitor removal and unlimited tracking",
                  });
                  setLockDialogOpen(false);
                }}
                className="w-full bg-gradient-to-r from-yellow-300 to-yellow-500 hover:from-yellow-400 hover:to-yellow-600 text-white font-bold py-4 rounded-full hover:scale-105 transition-all duration-200 shadow-lg text-lg"
              >
                <Crown className="w-5 h-5 mr-2" />
                🍋 Upgrade to Premium
              </AlertDialogAction>
              <AlertDialogCancel className="inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-background hover:text-accent-foreground h-10 mt-2 sm:mt-0 w-full rounded-full px-6 py-3 border-2 border-border transition-colors hover:bg-muted text-base font-medium text-[#000000]">
                Got it
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Updated AlertDialog for removal limit */}
        <AlertDialog open={showRemovalDialog} onOpenChange={setShowRemovalDialog}>
          <AlertDialogContent className="sm:max-w-md card-rounded border-2 border-primary/20 bg-background">
            <AlertDialogHeader className="text-center pb-6">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="text-3xl">🍋</span>
              </div>
              <AlertDialogTitle className="text-3xl font-bold text-foreground mb-4">
                Removal Limit Reached
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base text-muted-foreground leading-relaxed space-y-4">
                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                  <p className="text-orange-800 font-semibold">
                    Free users can only remove <span className="font-bold">3 competitors per month</span>
                  </p>
                  <p className="text-sm text-orange-700 mt-2">
                    You've reached your limit for this month. Reset on the 1st!
                  </p>
                </div>
                <div className="bg-primary/10 border-2 border-primary/20 rounded-xl p-4">
                  <p className="text-foreground font-semibold text-center">
                    ✨ Upgrade to Premium for unlimited competitor management
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col gap-3 pt-4">
              <AlertDialogAction 
                onClick={() => {
                  toast({
                    title: "Premium Coming Soon!",
                    description: "Upgrade to premium for unlimited competitor removal and tracking",
                  });
                  setShowRemovalDialog(false);
                }}
                className="w-full bg-gradient-to-r from-yellow-300 to-yellow-500 hover:from-yellow-400 hover:to-yellow-600 text-white font-bold py-4 rounded-full hover:scale-105 transition-all duration-200 shadow-lg text-lg"
              >
                <Crown className="w-5 h-5 mr-2" />
                🍋 Upgrade to Premium
              </AlertDialogAction>
              <AlertDialogCancel className="inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-background hover:text-accent-foreground h-10 mt-2 sm:mt-0 w-full rounded-full px-6 py-3 border-2 border-border transition-colors hover:bg-muted text-base font-medium text-[#000000]">
                Got it
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Quick Summary Modal */}
        <Dialog open={showQuickSummary} onOpenChange={setShowQuickSummary}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                <Zap className="w-6 h-6 text-primary" />
                Competitor Quick Summary
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {quickSummaryData?.summary?.meta?.reused 
                  ? "Based on recent analysis data" 
                  : "Fresh analysis of your tracked competitors"}
              </DialogDescription>
            </DialogHeader>
            
            {quickSummaryData && quickSummaryData.summary && (
              <div className="space-y-6">
                {/* Executive Summary */}
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                  <h3 className="font-bold text-lg mb-2 text-foreground">Executive Summary</h3>
                  <p className="text-foreground leading-relaxed">
                    {quickSummaryData.summary.executiveSummary || "No executive summary available"}
                  </p>
                </div>

                {/* Competitor Insights */}
                {quickSummaryData.summary?.competitorSnippets && quickSummaryData.summary.competitorSnippets.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-3 text-foreground">By Competitor</h3>
                    <div className="grid gap-3">
                      {quickSummaryData.summary.competitorSnippets.map((snippet: any, index: number) => (
                        <div key={index} className="border border-border rounded-lg p-3 bg-card">
                          <h4 className="font-semibold text-foreground mb-2">{snippet.competitor}</h4>
                          <ul className="space-y-1">
                            {snippet.bullets.slice(0, 2).map((bullet: string, bulletIndex: number) => (
                              <li key={bulletIndex} className="text-sm text-muted-foreground flex items-start">
                                <span className="w-1 h-1 bg-primary rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Signals */}
                {quickSummaryData.summary?.topSignals && quickSummaryData.summary.topSignals.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-3 text-foreground">Top Signals</h3>
                    <div className="space-y-2">
                      {quickSummaryData.summary.topSignals.slice(0, 3).map((signal: string, index: number) => (
                        <div key={index} className="flex items-start p-3 bg-muted/30 rounded-lg border border-border">
                          <TrendingUp className="w-4 h-4 text-primary mt-1 mr-2 flex-shrink-0" />
                          <span className="text-foreground text-sm">{signal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email and Actions */}
                <div className="flex gap-3 pt-4 border-t border-border">
                  {usage?.plan === 'premium' ? (
                    <Button
                      onClick={() => {
                        // TODO: Implement email functionality using existing endpoint
                        const userEmail = prompt("Enter your email address:");
                        if (userEmail && quickSummaryData.id) {
                          // Use existing email endpoint
                          apiRequest('POST', `/api/reports/${quickSummaryData.id}/email`, { email: userEmail })
                            .then(() => {
                              toast({
                                title: "Email Sent!",
                                description: "Quick summary has been sent to your email.",
                              });
                            })
                            .catch((error: any) => {
                              toast({
                                title: "Email Failed",
                                description: error.message || "Failed to send email",
                                variant: "destructive",
                              });
                            });
                        }
                      }}
                      className="btn-primary flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Email this Summary
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled
                      className="flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Email (Premium Only)
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={() => setShowQuickSummary(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>

                {/* Metadata */}
                <div className="text-xs text-muted-foreground text-center">
                  Generated on {new Date(quickSummaryData.summary.meta.generatedAt).toLocaleDateString()} • 
                  {quickSummaryData.summary.meta.competitorCount} competitors analyzed
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}