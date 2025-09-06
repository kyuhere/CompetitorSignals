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
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">🍋</span>
              </div>
              <span className="text-2xl font-bold text-foreground">Competitor Lemonade</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthenticated && user ? (
              <>
                {/* User Status Indicator */}
                <div className="flex items-center space-x-3 text-sm bg-soft-green px-4 py-2 rounded-xl border-2 border-primary/20" data-testid="user-status">
                  <User className="w-4 h-4 text-gray-700" />
                  <span className="font-medium text-gray-800" data-testid="text-user-email">{user.email || 'User'}</span>
                  <Badge className="bg-primary text-primary-foreground font-bold" data-testid="badge-user-tier">Free</Badge>
                </div>
                
                {/* Query Limit Indicator */}
                {usage && (
                  <div className="flex items-center space-x-3 text-sm bg-peach px-4 py-2 rounded-xl border-2 border-primary/20" data-testid="usage-indicator">
                    <span className="font-medium text-gray-800">🍋 Daily limit:</span>
                    <span className="font-bold text-gray-900" data-testid="text-usage-current">{usage.current}</span>
                    <span className="text-gray-700">/</span>
                    <span className="font-bold text-gray-900" data-testid="text-usage-limit">{usage.limit}</span>
                  </div>
                )}
                
                <Button
                  className="btn-secondary rounded-xl"
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
