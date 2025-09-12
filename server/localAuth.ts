import { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { storage } from './storage';
import { hashPassword, comparePassword, validateEmail, validatePassword } from './utils/auth';
import { rateLimitLogin, clearLoginRateLimit } from './utils/unified-auth';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Middleware to check if user is authenticated via local auth
 */
export const requireLocalAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.localUserId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

/**
 * Middleware to check if user has premium plan
 */
export const requirePremium: RequestHandler = async (req, res, next) => {
  if (!req.session?.localUserId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    const user = await storage.getUser(req.session.localUserId);
    if (!user || user.plan !== 'premium') {
      return res.status(403).json({ message: 'Premium plan required' });
    }
    
    // Add user to request for convenience
    req.localUser = user;
    next();
  } catch (error) {
    console.error('Error checking premium status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get current local authenticated user
 */
export const getCurrentUser: RequestHandler = async (req, res) => {
  if (!req.session?.localUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await storage.getUser(req.session.localUserId);
    if (!user) {
      // Clear invalid session
      req.session.localUserId = undefined;
      return res.status(401).json({ message: 'User not found' });
    }

    // Return user without password hash
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Setup local authentication routes
 */
export function setupLocalAuth(app: Express) {
  
  // Register new user with email/password
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = registerSchema.parse(req.body);
      
      // Normalize email to lowercase for consistent handling
      const normalizedEmail = email.toLowerCase().trim();

      // Validate email format
      if (!validateEmail(normalizedEmail)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ 
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        });
      }

      // Check if user already exists (use generic error to prevent account enumeration)
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: 'Registration failed. Please try a different email or sign in if you already have an account.' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await storage.createUserWithPassword({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        plan: 'free', // Default to free plan
      });

      // Create session with regeneration for security
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }
        
        req.session.localUserId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }

          // Return user without password hash
          const { passwordHash: _, ...userResponse } = user;
          res.status(201).json({
            message: 'User registered successfully',
            user: userResponse
          });
        });
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors.map(e => e.message)
        });
      }

      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Login with email/password
  app.post('/api/auth/local/login', rateLimitLogin, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // Normalize email to lowercase for consistent handling
      const normalizedEmail = email.toLowerCase().trim();

      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);
      
      // Generic error to prevent account enumeration
      if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Regenerate session for security (prevents session fixation)
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }
        
        req.session.localUserId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }

          // Clear rate limiting on successful login
          const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
          clearLoginRateLimit(clientIP);

          // Return user without password hash
          const { passwordHash: _, ...userResponse } = user;
          res.json({
            message: 'Login successful',
            user: userResponse
          });
        });
      });

    } catch (error) {
      console.error('Login error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors.map(e => e.message)
        });
      }

      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Logout from local auth
  app.post('/api/auth/local/logout', (req, res) => {
    // Destroy session completely for security
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }
      
      // Clear the session cookie
      res.clearCookie('connect.sid'); // Default express-session cookie name
      res.json({ message: 'Logged out successfully' });
    });
  });

  // Get current local authenticated user
  app.get('/api/auth/local/user', getCurrentUser);

  // Health check for local auth
  app.get('/api/auth/local/status', (req, res) => {
    res.json({
      isAuthenticated: !!req.session?.localUserId,
      sessionId: req.sessionID
    });
  });
}

// Extend Express session interface to include localUserId
declare module 'express-session' {
  interface SessionData {
    localUserId?: string;
  }
}

// Extend Express request interface to include localUser
declare global {
  namespace Express {
    interface Request {
      localUser?: import('@shared/schema').User;
    }
  }
}