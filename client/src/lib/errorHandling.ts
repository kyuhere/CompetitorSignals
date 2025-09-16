import { toast } from "@/hooks/use-toast";

export interface ErrorDetails {
  type: 'network' | 'server' | 'client' | 'authentication' | 'unknown';
  title: string;
  message: string;
  details?: string;
  statusCode?: number;
  timestamp: string;
  stack?: string;
  component?: string;
}

export function classifyError(error: any): ErrorDetails['type'] {
  if (!error) return 'unknown';
  
  // Network errors
  if (error.message?.includes('Failed to fetch') || error.message?.includes('Network Error')) {
    return 'network';
  }
  
  // Authentication errors
  if (error.status === 401 || error.message?.includes('Unauthorized') || error.message?.includes('Authentication required')) {
    return 'authentication';
  }
  
  // Server errors
  if (error.status >= 500 && error.status < 600) {
    return 'server';
  }
  
  // Client errors
  if (error.status >= 400 && error.status < 500) {
    return 'client';
  }
  
  return 'unknown';
}

export function createErrorDetails(error: any, component?: string): ErrorDetails {
  const type = classifyError(error);
  const timestamp = new Date().toISOString();
  
  const baseDetails: ErrorDetails = {
    type,
    title: getErrorTitle(type),
    message: getErrorMessage(error, type),
    timestamp,
    component,
  };
  
  // Add additional details based on error properties
  if (error?.status) {
    baseDetails.statusCode = error.status;
  }
  
  if (error?.details) {
    baseDetails.details = error.details;
  }
  
  if (error?.stack && process.env.NODE_ENV === 'development') {
    baseDetails.stack = error.stack;
  }
  
  return baseDetails;
}

function getErrorTitle(type: ErrorDetails['type']): string {
  switch (type) {
    case 'network':
      return 'Network Connection Error';
    case 'server':
      return 'Server Error';
    case 'client':
      return 'Request Error';
    case 'authentication':
      return 'Authentication Required';
    default:
      return 'Something Went Wrong';
  }
}

function getErrorMessage(error: any, type: ErrorDetails['type']): string {
  // Use the error message if it's user-friendly
  if (error?.message && !error.message.includes('Failed to fetch')) {
    return error.message;
  }
  
  // Provide user-friendly messages based on error type
  switch (type) {
    case 'network':
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    case 'server':
      return 'The server encountered an error while processing your request. Please try again later.';
    case 'client':
      return 'There was an issue with your request. Please check your input and try again.';
    case 'authentication':
      return 'You need to sign in to access this feature.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

export function handleQueryError(error: any, options?: {
  showToast?: boolean;
  component?: string;
  customMessage?: string;
  redirectToErrorPage?: boolean;
}) {
  const {
    showToast = true,
    component,
    customMessage,
    redirectToErrorPage = false,
  } = options || {};
  
  console.error('Query error:', error);
  
  const errorDetails = createErrorDetails(error, component);
  
  if (customMessage) {
    errorDetails.message = customMessage;
  }
  
  // Store error details for the error page if needed
  if (redirectToErrorPage) {
    localStorage.setItem('lastError', JSON.stringify(errorDetails));
    window.location.href = '/error';
    return;
  }
  
  // Show toast notification
  if (showToast) {
    toast({
      title: errorDetails.title,
      description: errorDetails.message,
      variant: "destructive",
    });
  }
  
  return errorDetails;
}

export function handleMutationError(error: any, options?: {
  showToast?: boolean;
  component?: string;
  customMessage?: string;
  onAuthError?: () => void;
}) {
  const {
    showToast = true,
    component,
    customMessage,
    onAuthError,
  } = options || {};
  
  console.error('Mutation error:', error);
  
  const errorDetails = createErrorDetails(error, component);
  
  if (customMessage) {
    errorDetails.message = customMessage;
  }
  
  // Handle authentication errors
  if (errorDetails.type === 'authentication' && onAuthError) {
    onAuthError();
    return errorDetails;
  }
  
  // Show toast notification
  if (showToast) {
    toast({
      title: errorDetails.title,
      description: errorDetails.message,
      variant: "destructive",
    });
  }
  
  return errorDetails;
}

export function navigateToErrorPage(errorDetails?: ErrorDetails) {
  if (errorDetails) {
    localStorage.setItem('lastError', JSON.stringify(errorDetails));
  }
  window.location.href = '/error';
}

// Global unhandled error handler
export function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const errorDetails = createErrorDetails(event.reason, 'Global');
    
    // Show toast for unhandled rejections
    toast({
      title: "Unexpected Error",
      description: errorDetails.message,
      variant: "destructive",
    });
    
    // Store error details in case user wants to report it
    localStorage.setItem('lastUnhandledError', JSON.stringify(errorDetails));
  });
  
  // Handle general errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    const errorDetails = createErrorDetails(event.error, 'Global');
    
    // Only show toast for serious errors, not minor ones
    if (errorDetails.type === 'server' || errorDetails.type === 'network') {
      toast({
        title: "System Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    }
    
    localStorage.setItem('lastGlobalError', JSON.stringify(errorDetails));
  });
}