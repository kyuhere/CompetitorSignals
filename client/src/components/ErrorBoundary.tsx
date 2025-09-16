import { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
  errorId: string;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    retryCount: 0,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { 
      hasError: true, 
      error,
      errorId,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleRetry = () => {
    // Clear React Query cache to ensure clean state
    queryClient.clear();
    
    // Increment retry count and reset error state
    this.setState(prevState => ({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      retryCount: prevState.retryCount + 1,
      errorId: '',
    }));
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReportError = () => {
    const errorDetails = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    
    console.log('Error details for reporting:', errorDetails);
    
    // In a real app, you would send this to your error reporting service
    alert('Error details have been logged to the console. In a production app, this would be sent to error reporting.');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Something went wrong
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                We encountered an unexpected error. Don't worry, this has been logged and we're working to fix it.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Error Details */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wider">
                  Error Details
                </h3>
                <p className="text-sm text-foreground font-mono">
                  {this.state.error?.message || 'Unknown error occurred'}
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                      Stack Trace (Development)
                    </summary>
                    <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded overflow-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={this.handleRetry}
                  className="flex-1 flex items-center justify-center gap-2"
                  data-testid="button-retry-error"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2"
                  data-testid="button-home-error"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </Button>
                <Button
                  onClick={this.handleReportError}
                  variant="ghost"
                  size="sm"
                  className="flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                  data-testid="button-report-error"
                >
                  <Bug className="w-3 h-3" />
                  Report Issue
                </Button>
              </div>

              {/* Additional Info */}
              <div className="text-center text-xs text-muted-foreground">
                <p>
                  If this error persists, try refreshing the page or contact support.
                </p>
                <p className="mt-1">
                  Error ID: {this.state.errorId}
                </p>
                {this.state.retryCount > 0 && (
                  <p className="mt-1 text-yellow-600">
                    Retry attempts: {this.state.retryCount}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Use retry count as key to force remount of children on retry
    return (
      <div key={`error-boundary-${this.state.retryCount}`}>
        {this.props.children}
      </div>
    );
  }
}

export default ErrorBoundary;