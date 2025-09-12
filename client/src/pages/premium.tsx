import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, X, TrendingUp, Users, BarChart3, Mail, Clock, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function PremiumPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch usage stats to determine current plan
  const { data: usage, isLoading: usageLoading } = useQuery<{
    current: number;
    limit: number;
    remaining: number;
    plan: string;
    isLoggedIn: boolean;
  }>({
    queryKey: ["/api/usage"],
  });

  if (authLoading || usageLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Authentication Required</h1>
            <p className="text-muted-foreground mb-4">
              Please sign in to access premium features.
            </p>
            <Button onClick={() => window.location.href = '/'}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = usage?.plan || 'free';
  const isPremium = currentPlan === 'premium';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-2xl">🍋</span>
              </div>
              <span className="text-xl font-bold text-foreground">Premium Features</span>
            </div>
            
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
              data-testid="button-back-dashboard"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Premium Status Banner */}
        <div className="mb-8">
          <Card className={`${isPremium ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isPremium ? 'bg-green-100' : 'bg-yellow-100'}`}>
                    {isPremium ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <Shield className="w-6 h-6 text-yellow-600" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground" data-testid="text-premium-title">
                      {isPremium ? 'Premium Active' : 'Upgrade to Premium'}
                    </h1>
                    <p className="text-muted-foreground" data-testid="text-premium-subtitle">
                      {isPremium 
                        ? 'You have access to all premium features'
                        : 'Unlock advanced competitor intelligence features'
                      }
                    </p>
                  </div>
                </div>
                <Badge 
                  className={isPremium ? 'bg-green-600' : 'bg-yellow-600'} 
                  data-testid="badge-current-plan"
                >
                  {isPremium ? 'Premium' : 'Free'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Free Plan */}
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Free Plan</CardTitle>
              <p className="text-3xl font-bold text-primary">$0<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-3">
                <li className="flex items-center" data-testid="feature-free-competitors">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span>Track up to 3 competitors</span>
                </li>
                <li className="flex items-center" data-testid="feature-free-reports">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span>Basic competitor reports</span>
                </li>
                <li className="flex items-center" data-testid="feature-free-history">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span>Report history</span>
                </li>
                <li className="flex items-center" data-testid="feature-free-export">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span>Export to PDF</span>
                </li>
                <li className="flex items-center" data-testid="feature-free-support">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span>Community support</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Premium Plan */}
          <Card className={`border-2 ${isPremium ? 'border-green-500 bg-green-50' : 'border-primary'}`}>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CardTitle className="text-xl">Premium Plan</CardTitle>
                {isPremium && <Badge className="bg-green-600">Current</Badge>}
              </div>
              <p className="text-3xl font-bold text-primary">$9.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-3">
                <li className="flex items-center" data-testid="feature-premium-unlimited">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span className="font-medium">Unlimited competitor tracking</span>
                </li>
                <li className="flex items-center" data-testid="feature-premium-advanced">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <span className="font-medium">Advanced data sources</span>
                </li>
                <li className="flex items-center" data-testid="feature-premium-scheduled">
                  <Mail className="w-5 h-5 text-blue-600 mr-3" />
                  <span className="font-medium">Scheduled email reports</span>
                </li>
                <li className="flex items-center" data-testid="feature-premium-trends">
                  <TrendingUp className="w-5 h-5 text-purple-600 mr-3" />
                  <span className="font-medium">Trend tracking & alerts</span>
                </li>
                <li className="flex items-center" data-testid="feature-premium-priority">
                  <Zap className="w-5 h-5 text-yellow-600 mr-3" />
                  <span className="font-medium">Priority support</span>
                </li>
                <li className="flex items-center" data-testid="feature-premium-api">
                  <BarChart3 className="w-5 h-5 text-indigo-600 mr-3" />
                  <span className="font-medium">API access</span>
                </li>
              </ul>
              
              {!isPremium && (
                <Button 
                  className="w-full mt-6" 
                  disabled
                  data-testid="button-upgrade-premium"
                >
                  Coming Soon
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Premium Features Detail */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Unlimited Tracking</h3>
              <p className="text-muted-foreground">
                Track as many competitors as you need. No limits, no restrictions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Automated Reports</h3>
              <p className="text-muted-foreground">
                Get scheduled reports delivered to your inbox automatically.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Advanced Analytics</h3>
              <p className="text-muted-foreground">
                Deep insights with trend analysis and competitive positioning.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Current Usage Display */}
        {usage && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Your Current Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center" data-testid="usage-tracked">
                  <div className="text-3xl font-bold text-primary">{usage.current}</div>
                  <p className="text-muted-foreground">Competitors Tracked</p>
                  <p className="text-sm text-muted-foreground">
                    {usage.remaining} remaining of {usage.limit} limit
                  </p>
                </div>
                <div className="text-center" data-testid="usage-plan">
                  <div className="text-3xl font-bold text-green-600">{currentPlan.toUpperCase()}</div>
                  <p className="text-muted-foreground">Current Plan</p>
                </div>
                <div className="text-center" data-testid="usage-reports">
                  <div className="text-3xl font-bold text-blue-600">∞</div>
                  <p className="text-muted-foreground">Reports Generated</p>
                  <p className="text-sm text-muted-foreground">Unlimited analyses</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}