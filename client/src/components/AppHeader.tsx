import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Settings, User } from "lucide-react";

interface AppHeaderProps {
  usage?: {
    current: number;
    limit: number;
    remaining: number;
    isLoggedIn: boolean;
  };
}

export default function AppHeader({ usage }: AppHeaderProps) {
  const { user, isAuthenticated } = useAuth();

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50" data-testid="header-app">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold text-foreground">AI Competitor Signals</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthenticated && user ? (
              <>
                {/* User Status Indicator */}
                <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md" data-testid="user-status">
                  <User className="w-4 h-4 text-primary" />
                  <span data-testid="text-user-email">{user.email || 'User'}</span>
                  <Badge variant="secondary" data-testid="badge-user-tier">Free</Badge>
                </div>
                
                {/* Query Limit Indicator */}
                {usage && (
                  <div className="flex items-center space-x-2 text-sm" data-testid="usage-indicator">
                    <span className="text-muted-foreground">Daily limit:</span>
                    <span className="font-medium text-foreground" data-testid="text-usage-current">{usage.current}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-medium text-foreground" data-testid="text-usage-limit">{usage.limit}</span>
                  </div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = '/api/logout'}
                  data-testid="button-logout"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-login"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
