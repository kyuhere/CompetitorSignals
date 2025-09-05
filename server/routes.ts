import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCompetitorReportSchema } from "@shared/schema";
import { z } from "zod";
import { signalAggregator } from "./services/signalAggregator";
import { summarizeCompetitorSignals } from "./services/openai";

const competitorAnalysisSchema = z.object({
  competitors: z.string().min(1, "At least one competitor is required"),
  urls: z.string().optional(),
  sources: z.object({
    news: z.boolean().default(true),
    funding: z.boolean().default(true),
    social: z.boolean().default(true),
    products: z.boolean().default(false),
  }).default({}),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get user usage stats
  app.get('/api/usage', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const sessionId = req.sessionID;
      
      const rateLimit = await storage.getRateLimit(userId, sessionId);
      const isLoggedIn = !!userId;
      
      const limit = isLoggedIn ? 5 : 999999; // Unlimited for guests during testing
      const current = rateLimit?.queryCount || 0;
      const remaining = Math.max(0, limit - current);
      
      res.json({
        current,
        limit,
        remaining,
        isLoggedIn,
        resetTime: rateLimit?.lastReset || new Date(),
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage stats" });
    }
  });

  // Analyze competitors
  app.post('/api/analyze', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const sessionId = req.sessionID;
      const isLoggedIn = !!userId;
      
      // Validate request
      const validation = competitorAnalysisSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.issues 
        });
      }
      
      const { competitors, urls, sources } = validation.data;
      
      // Parse competitors
      const competitorList = competitors
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
      
      // Check rate limits - unlimited for guests during testing, normal limits for logged-in users
      const limit = isLoggedIn ? 5 : 999999; // Unlimited for guests during testing
      const rateLimit = await storage.getRateLimit(userId, sessionId);
      
      // Reset if new day for logged-in users
      const today = new Date();
      const lastReset = rateLimit?.lastReset || new Date(0);
      const shouldReset = isLoggedIn ? 
        (today.getDate() !== lastReset.getDate() || 
         today.getMonth() !== lastReset.getMonth() ||
         today.getFullYear() !== lastReset.getFullYear()) :
        false; // Don't reset for guests during testing
      
      let currentCount = shouldReset ? 0 : (rateLimit?.queryCount || 0);
      
      // Only check limits for logged-in users during testing
      if (isLoggedIn && currentCount >= limit) {
        return res.status(429).json({ 
          message: "Daily query limit exceeded. Please try again tomorrow.",
          limit,
          current: currentCount,
        });
      }
      
      // Check competitor count against tier
      if (competitorList.length > limit) {
        return res.status(400).json({ 
          message: `You can analyze up to ${limit} competitors with your current tier.`,
          limit,
          requested: competitorList.length,
        });
      }
      
      // Update rate limit
      await storage.upsertRateLimit({
        userId,
        sessionId: isLoggedIn ? undefined : sessionId,
        queryCount: currentCount + 1,
        lastReset: shouldReset ? today : lastReset,
      });
      
      // Aggregate signals
      const urlList = urls ? urls.split('\n').map(url => url.trim()).filter(url => url.length > 0) : [];
      const signals = await signalAggregator.aggregateSignals(competitorList, urlList, sources);
      
      // Generate AI summary
      const summary = await summarizeCompetitorSignals(signals, competitorList);
      
      // Create report
      const reportData = {
        userId: userId || `guest_${sessionId}`,
        title: `${competitorList.slice(0, 2).join(', ')}${competitorList.length > 2 ? ` +${competitorList.length - 2} more` : ''} Analysis`,
        competitors: competitorList,
        signals,
        summary,
        metadata: {
          signalCount: signals.reduce((acc: number, s: any) => acc + s.items.length, 0),
          sources: Object.keys(sources).filter(key => sources[key as keyof typeof sources]),
          generatedAt: new Date().toISOString(),
        },
      };
      
      let report;
      if (isLoggedIn) {
        // Save report for logged-in users
        report = await storage.createReport(reportData);
      } else {
        // Return temporary report for guests
        report = {
          ...reportData,
          id: `temp_${Date.now()}`,
          createdAt: new Date(),
        };
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error analyzing competitors:", error);
      res.status(500).json({ 
        message: "Failed to analyze competitors. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get user reports
  app.get('/api/reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reports = await storage.getUserReports(userId, 20);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Get specific report
  app.get('/api/reports/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;
      
      const report = await storage.getReportById(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check if user owns the report (for logged-in users)
      if (userId && report.userId !== userId && !report.userId.startsWith('guest_')) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
