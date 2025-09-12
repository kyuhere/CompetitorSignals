import { RequestHandler } from 'express';
import { storage } from '../storage';
import { User } from '@shared/schema';

export interface AuthContext {
  isAuthenticated: boolean;
  userId?: string;
  user?: User;
  plan?: string;
  authMethod?: 'replit' | 'local';
}

/**
 * Get unified authentication context from request
 * Supports both Replit Auth and Local Auth
 */
export async function getAuthContext(req: any): Promise<AuthContext> {
  // Check Replit Auth first (existing system)
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
    const userId = req.user.claims.sub;
    try {
      const user = await storage.getUser(userId);
      if (user) {
        return {
          isAuthenticated: true,
          userId,
          user,
          plan: user.plan || 'free',
          authMethod: 'replit'
        };
      }
    } catch (error) {
      console.error('Error fetching Replit Auth user:', error);
    }
  }

  // Check Local Auth
  if (req.session?.localUserId) {
    try {
      const user = await storage.getUser(req.session.localUserId);
      if (user) {
        return {
          isAuthenticated: true,
          userId: req.session.localUserId,
          user,
          plan: user.plan || 'free',
          authMethod: 'local'
        };
      }
    } catch (error) {
      console.error('Error fetching Local Auth user:', error);
    }
  }

  // Not authenticated
  return {
    isAuthenticated: false
  };
}

/**
 * Middleware that requires any authentication (Replit or Local)
 */
export const requireAnyAuth: RequestHandler = async (req, res, next) => {
  const authContext = await getAuthContext(req);
  
  if (!authContext.isAuthenticated) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Add auth context to request for downstream use
  req.authContext = authContext;
  next();
};

/**
 * Middleware that requires premium plan (works with either auth method)
 */
export const requirePremiumAny: RequestHandler = async (req, res, next) => {
  const authContext = await getAuthContext(req);
  
  if (!authContext.isAuthenticated) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (authContext.plan !== 'premium') {
    return res.status(403).json({ 
      message: 'Premium plan required',
      currentPlan: authContext.plan 
    });
  }

  // Add auth context to request for downstream use
  req.authContext = authContext;
  next();
};

/**
 * Middleware that adds auth context to request (optional authentication)
 */
export const addAuthContext: RequestHandler = async (req, res, next) => {
  const authContext = await getAuthContext(req);
  req.authContext = authContext;
  next();
};

// Rate limiting store (simple in-memory for demo - use Redis in production)
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockUntil?: number }>();

/**
 * Basic rate limiting for login attempts
 */
export const rateLimitLogin: RequestHandler = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const lockoutMs = 30 * 60 * 1000; // 30 minutes lockout

  const attempts = loginAttempts.get(clientIP);

  if (attempts) {
    // Check if still locked out
    if (attempts.lockUntil && now < attempts.lockUntil) {
      const remainingMs = attempts.lockUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return res.status(429).json({ 
        message: `Too many login attempts. Try again in ${remainingMinutes} minutes.`,
        retryAfter: remainingMs
      });
    }

    // Reset if window has expired
    if (now - attempts.lastAttempt > windowMs) {
      loginAttempts.set(clientIP, { count: 1, lastAttempt: now });
    } else {
      // Increment attempts
      attempts.count++;
      attempts.lastAttempt = now;

      // Lock if exceeded max attempts
      if (attempts.count > maxAttempts) {
        attempts.lockUntil = now + lockoutMs;
        return res.status(429).json({ 
          message: `Too many login attempts. Account locked for 30 minutes.`,
          retryAfter: lockoutMs
        });
      }

      loginAttempts.set(clientIP, attempts);
    }
  } else {
    // First attempt
    loginAttempts.set(clientIP, { count: 1, lastAttempt: now });
  }

  next();
};

/**
 * Helper to clear rate limit on successful login
 */
export function clearLoginRateLimit(clientIP: string) {
  loginAttempts.delete(clientIP);
}

// Extend Express request interface
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}