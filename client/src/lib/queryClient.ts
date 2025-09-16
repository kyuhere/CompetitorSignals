import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { handleQueryError, handleMutationError } from "./errorHandling";

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    const text = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = { message: text || res.statusText };
    }
    
    const error = new Error(errorData.message || `${res.status}: ${res.statusText}`);
    // Attach additional error data for lock handling and better error classification
    Object.assign(error, errorData);
    // Attach response context for proper retry logic and error handling
    (error as any).status = res.status;
    (error as any).code = res.status;
    (error as any).statusText = res.statusText;
    if (url) (error as any).url = url;
    if (text) {
      try {
        (error as any).body = JSON.parse(text);
      } catch {
        (error as any).body = text;
      }
    }
    throw error;
  }
}

export async function apiRequest(method: string, url: string, data?: any): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Add guest search data to headers if available and making auth request
  if (url.includes('/api/auth/user')) {
    const guestSearchResult = localStorage.getItem('guestSearchResult');
    if (guestSearchResult) {
      options.headers = {
        ...options.headers,
        'x-guest-search': guestSearchResult
      };
      // Clear the stored guest search after sending
      localStorage.removeItem('guestSearchResult');
    }
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });

  await throwIfResNotOk(res, url);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, queryKey.join("/") as string);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error: any) => {
        // Don't retry on client errors (4xx)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Only retry server errors (5xx) up to 2 times
        return failureCount < 2;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      onError: (error: any, query) => {
        // Allow queries to opt out of global error handling
        if (query.meta?.silent) return;
        
        // Handle global query errors
        handleQueryError(error, {
          component: 'QueryClient',
          showToast: !query.meta?.noToast,
          redirectToErrorPage: query.meta?.redirectToErrorPage,
        });
      },
    },
    mutations: {
      retry: false,
      onError: (error: any, variables, context, mutation) => {
        // Allow mutations to opt out of global error handling
        if (mutation.meta?.silent) return;
        
        // Handle global mutation errors
        handleMutationError(error, {
          component: 'QueryClient',
          showToast: !mutation.meta?.noToast,
        });
      },
    },
  },
});

// Create specialized queryFn for auth queries that shouldn't throw on 401
export const authQueryFn = getQueryFn({ on401: "returnNull" });
