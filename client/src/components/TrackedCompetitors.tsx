import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Building2, Clock, TrendingUp, Zap, Lock, Crown } from "lucide-react";
import type { TrackedCompetitor } from "@shared/schema";

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

export default function TrackedCompetitors() {
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockInfo, setLockInfo] = useState<{
    daysRemaining: number;
    unlockDate: string;
    competitorName: string;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tracked competitors
  const { data: trackedData, isLoading } = useQuery<TrackedCompetitorsResponse>({
    queryKey: ['/api/competitors/tracked'],
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
    removeCompetitorMutation.mutate(competitorId);
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
            className="bg-primary text-primary-foreground font-bold px-3 py-1" 
            data-testid="text-competitor-count"
          >
            {trackedData?.count || 0} / {trackedData?.limit || 3}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          Manage the competitors you want to monitor. We'll analyze them automatically every two weeks.
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

        {/* Manual Analysis Button */}
        {trackedData && trackedData.count > 0 && (
          <Button
            onClick={() => {
              // This would trigger analysis of tracked competitors
              // For now, we'll show a toast
              toast({
                title: "Analysis Started",
                description: "Analyzing your tracked competitors. This may take a few minutes.",
              });
            }}
            variant="outline"
            className="w-full py-4 text-lg border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-bold rounded-xl"
            data-testid="button-analyze-tracked"
          >
            <Zap className="w-5 h-5 mr-2" />
            Analyze Now
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

        {/* Lock Dialog */}
        <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center text-xl">
                <Lock className="w-6 h-6 mr-2 text-orange-500" />
                Competitor Locked
              </DialogTitle>
              <DialogDescription className="text-base">
                You can only track 3 competitors and they're locked until the end of the month.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-orange-800">Unlock in:</span>
                  <span className="text-lg font-bold text-orange-600">
                    {lockInfo?.daysRemaining} days
                  </span>
                </div>
                <p className="text-xs text-orange-700">
                  Available on {lockInfo?.unlockDate ? new Date(lockInfo.unlockDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>

              <div className="flex flex-col space-y-3">
                <Button
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-3"
                  onClick={() => {
                    toast({
                      title: "Premium Coming Soon!",
                      description: "Upgrade to premium for unlimited competitor tracking",
                    });
                    setLockDialogOpen(false);
                  }}
                >
                  <Crown className="w-5 h-5 mr-2" />
                  Upgrade to Premium
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => setLockDialogOpen(false)}
                  className="w-full"
                >
                  Got it
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}