import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  Copy, 
  Clock, 
  AlertCircle,
  Server,
  Wifi,
  Shield,
  Bug
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ErrorDetails {
  type: 'network' | 'server' | 'client' | 'authentication' | 'unknown';
  title: string;
  message: string;
  details?: string;
  statusCode?: number;
  timestamp: string;
  stack?: string;
  component?: string;
}

export default function ErrorPage() {
  const [, setLocation] = useLocation();
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Try to get error details from URL params or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const storedError = localStorage.getItem('lastError');

    let error: ErrorDetails | null = null;

    if (errorParam) {
      try {
        error = JSON.parse(decodeURIComponent(errorParam));
      } catch {
        // If parsing fails, create a generic error
        error = {
          type: 'unknown',
          title: 'Unknown Error',
          message: errorParam,
          timestamp: new Date().toISOString(),
        };
      }
    } else if (storedError) {
      try {
        error = JSON.parse(storedError);
        // Clear stored error after reading
        localStorage.removeItem('lastError');
      } catch {
        // Fallback if stored error is corrupted
      }
    }

    if (!error) {
      // Create default error if none found
      error = {
        type: 'unknown',
        title: 'Page Error',
        message: 'An unexpected error occurred while loading the page.',
        timestamp: new Date().toISOString(),
      };
    }

    setErrorDetails(error);
  }, []);

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'network':
        return <Wifi className="w-8 h-8" />;
      case 'server':
        return <Server className="w-8 h-8" />;
      case 'authentication':
        return <Shield className="w-8 h-8" />;
      case 'client':
        return <AlertCircle className="w-8 h-8" />;
      default:
        return <AlertTriangle className="w-8 h-8" />;
    }
  };

  const getErrorColor = (type: string) => {
    switch (type) {
      case 'network':
        return 'text-blue-600 bg-blue-100';
      case 'server':
        return 'text-red-600 bg-red-100';
      case 'authentication':
        return 'text-yellow-600 bg-yellow-100';
      case 'client':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-destructive bg-destructive/10';
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/');
    }
  };

  const handleGoHome = () => {
    setLocation('/');
  };

  const copyErrorDetails = () => {
    if (!errorDetails) return;

    const errorText = [
      `Error Type: ${errorDetails.type}`,
      `Title: ${errorDetails.title}`,
      `Message: ${errorDetails.message}`,
      `Status Code: ${errorDetails.statusCode || 'N/A'}`,
      `Timestamp: ${errorDetails.timestamp}`,
      `Details: ${errorDetails.details || 'None'}`,
      `User Agent: ${navigator.userAgent}`,
      `URL: ${window.location.href}`,
      errorDetails.stack ? `Stack: ${errorDetails.stack}` : '',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(errorText).then(() => {
      toast({
        title: "Error details copied",
        description: "Error information has been copied to your clipboard",
      });
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = errorText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      toast({
        title: "Error details copied",
        description: "Error information has been copied to your clipboard",
      });
    });
  };

  const reportError = () => {
    console.log('Error details for reporting:', errorDetails);
    // In a real app, you would send this to your error reporting service
    toast({
      title: "Error Reported",
      description: "Thank you for reporting this issue. We'll look into it.",
    });
  };

  if (!errorDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="w-full">
          <CardHeader className="text-center pb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${getErrorColor(errorDetails.type)}`}>
              {getErrorIcon(errorDetails.type)}
            </div>
            <CardTitle className="text-3xl font-bold text-foreground mb-2">
              {errorDetails.title}
            </CardTitle>
            <p className="text-muted-foreground text-lg">
              {errorDetails.message}
            </p>
            <div className="flex justify-center mt-4">
              <Badge variant="secondary" className="text-xs">
                Error Type: {errorDetails.type.toUpperCase()}
              </Badge>
              {errorDetails.statusCode && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Status: {errorDetails.statusCode}
                </Badge>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Error Details Section */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Error Information
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Timestamp:</span>
                  <span className="font-mono text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(errorDetails.timestamp).toLocaleString()}
                  </span>
                </div>
                
                {errorDetails.statusCode && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status Code:</span>
                    <span className="font-mono text-foreground">
                      {errorDetails.statusCode}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Error ID:</span>
                  <span className="font-mono text-foreground">
                    {Date.now().toString(36).toUpperCase()}
                  </span>
                </div>

                {errorDetails.details && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground text-sm">Additional Details:</span>
                      <pre className="text-sm text-foreground mt-1 p-2 bg-muted rounded overflow-auto">
                        {errorDetails.details}
                      </pre>
                    </div>
                  </>
                )}

                {errorDetails.stack && process.env.NODE_ENV === 'development' && (
                  <>
                    <Separator />
                    <details>
                      <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                        Stack Trace (Development Mode)
                      </summary>
                      <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded overflow-auto max-h-40">
                        {errorDetails.stack}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            </div>

            {/* Suggested Actions */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">What you can do:</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Try refreshing the page or retrying the action</li>
                <li>Check your internet connection</li>
                <li>Clear your browser cache and cookies</li>
                <li>If the problem persists, report this error to support</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={handleRetry}
                className="flex-1 flex items-center justify-center gap-2"
                data-testid="button-retry"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
              <Button
                onClick={handleGoBack}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-2"
                data-testid="button-go-back"
              >
                Go Back
              </Button>
              <Button
                onClick={handleGoHome}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-2"
                data-testid="button-go-home"
              >
                <Home className="w-4 h-4" />
                Home
              </Button>
            </div>

            <Separator />

            {/* Utility Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={copyErrorDetails}
                variant="ghost"
                size="sm"
                className="flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                data-testid="button-copy-details"
              >
                <Copy className="w-3 h-3" />
                Copy Error Details
              </Button>
              <Button
                onClick={reportError}
                variant="ghost"
                size="sm"
                className="flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                data-testid="button-report-error"
              >
                <Bug className="w-3 h-3" />
                Report This Error
              </Button>
            </div>

            {/* Help Text */}
            <div className="text-center text-xs text-muted-foreground pt-4">
              <p>
                Need help? Contact our support team with the error details above.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}