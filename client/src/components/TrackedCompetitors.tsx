import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Building2, Clock, TrendingUp, BarChart3 } from "lucide-react";
import type { TrackedCompetitor } from "@shared/schema";

interface TrackedCompetitorsProps {
  onAnalyzeTracked?: (data: any) => void;
}

interface TrackedCompetitorsResponse {
  competitors: TrackedCompetitor[];
  count: number;
  limit: number;
}

export default function TrackedCompetitors({ onAnalyzeTracked }: TrackedCompetitorsProps) {
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tracked competitors
  const { data: trackedCompetitors, isLoading } = useQuery<TrackedCompetitorsResponse>({
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
        title: "Success",
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
        title: "Success",
        description: "Competitor removed from your tracking list",
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

  // Analyze all tracked competitors
  const analyzeAllMutation = useMutation({
    mutationFn: async () => {
      if (!trackedCompetitors?.competitors?.length) {
        throw new Error("No competitors to analyze");
      }
      
      // Use the unified analysis system
      const competitorNames = trackedCompetitors.competitors.map(c => c.competitorName).join('\n');
      const analysisData = {
        competitors: competitorNames,
        sources: {
          news: true,
          funding: true,
          social: true,
          products: false
        },
        autoTrack: false // Don't re-track since they're already tracked
      };
      
      if (onAnalyzeTracked) {
        onAnalyzeTracked(analysisData);
        return { success: true };
      } else {
        const response = await apiRequest("POST", "/api/analyze", analysisData);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Analysis Complete",
        description: "Your tracked competitors have been analyzed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze competitors",
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
    if (confirm(`Are you sure you want to remove "${competitorName}" from your tracking list?`)) {
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

  const canAddMore = trackedCompetitors ? trackedCompetitors.count < trackedCompetitors.limit : true;

  if (isLoading) {
    return (
      <Card data-testid="card-tracked-competitors">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Building2 className="w-5 h-5 mr-2" />
            Tracked Competitors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-tracked-competitors">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Building2 className="w-5 h-5 mr-2" />
            Tracked Competitors
          </CardTitle>
          <Badge variant="secondary" data-testid="text-competitor-count">
            {trackedCompetitors?.count || 0} / {trackedCompetitors?.limit || 5}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage the competitors you want to monitor. We'll analyze these every two weeks.
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Competitor List */}
        <div className="space-y-2">
          {trackedCompetitors?.competitors?.map((competitor) => (
            <div
              key={competitor.id}
              className="flex items-center justify-between p-3 border border-border rounded-lg"
              data-testid={`competitor-item-${competitor.id}`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground" data-testid={`text-competitor-name-${competitor.id}`}>
                    {competitor.competitorName}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center">
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
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          
          {(!trackedCompetitors?.competitors || trackedCompetitors.competitors.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No competitors being tracked yet</p>
              <p className="text-sm">Add your first competitor to get started</p>
            </div>
          )}
        </div>

        {/* Add New Competitor */}
        {isAdding ? (
          <div className="flex space-x-2">
            <Input
              placeholder="Enter competitor name..."
              value={newCompetitorName}
              onChange={(e) => setNewCompetitorName(e.target.value)}
              onKeyDown={handleKeyPress}
              autoFocus
              data-testid="input-new-competitor"
              className="flex-1"
            />
            <Button
              onClick={handleAddCompetitor}
              disabled={addCompetitorMutation.isPending || !newCompetitorName.trim()}
              data-testid="button-confirm-add"
              size="sm"
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
              size="sm"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setIsAdding(true)}
            disabled={!canAddMore}
            variant={canAddMore ? "default" : "secondary"}
            data-testid="button-add-competitor"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            {canAddMore ? "Add Competitor" : `Limit Reached (${trackedCompetitors?.limit || 5} max)`}
          </Button>
        )}

        {/* Analyze All Button */}
        {trackedCompetitors?.competitors && trackedCompetitors.competitors.length > 0 && (
          <div className="pt-4 border-t">
            <Button
              onClick={() => analyzeAllMutation.mutate()}
              disabled={analyzeAllMutation.isPending}
              className="w-full"
              data-testid="button-analyze-all"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {analyzeAllMutation.isPending ? "Analyzing..." : `Analyze All ${trackedCompetitors?.competitors?.length || 0} Competitors`}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Get fresh competitive intelligence for all your tracked competitors
            </p>
          </div>
        )}

        {/* Weekly Analysis Notice */}
        {trackedCompetitors && trackedCompetitors.count > 0 && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              These competitors will be automatically analyzed every two weeks
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}