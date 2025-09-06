import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCompetitorReportSchema, insertTrackedCompetitorSchema } from "@shared/schema";
import { z } from "zod";
import { signalAggregator } from "./services/signalAggregator";
import { summarizeCompetitorSignals, generateFastPreview } from "./services/openai";
import { sendCompetitorReport } from "./email";

// Store active streaming sessions
const streamingSessions = new Map<string, any>();

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
      
      // Check if there's a guest search to migrate
      const guestSearchData = req.headers['x-guest-search'];
      if (guestSearchData) {
        try {
          const guestReport = JSON.parse(guestSearchData as string);
          if (guestReport && guestReport.id && guestReport.id.startsWith('temp_')) {
            // Convert guest report to permanent report
            const reportData = {
              userId,
              title: guestReport.title,
              competitors: guestReport.competitors,
              signals: guestReport.signals,
              summary: guestReport.summary,
              metadata: guestReport.metadata,
            };
            await storage.createReport(reportData);
          }
        } catch (error) {
          console.error('Error migrating guest search:', error);
        }
      }
      
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

  // Streaming analysis endpoint for real-time results
  app.get('/api/analyze/stream/:sessionId', (req: any, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write('data: {"type": "keepalive"}\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

    // Store the response object for this session
    streamingSessions.set(req.params.sessionId, res);
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
      
      // Aggregate signals with streaming support
      const urlList = urls ? urls.split('\n').map(url => url.trim()).filter(url => url.length > 0) : [];
      
      // Generate a unique session ID for streaming
      const streamSessionId = `${sessionId}_${Date.now()}`;
      
      // Send initial progress update
      const streamRes = streamingSessions.get(streamSessionId);
      if (streamRes) {
        streamRes.write(`data: ${JSON.stringify({
          type: "progress",
          message: "Gathering competitor signals...",
          progress: 20
        })}\n\n`);
      }
      
      // Aggregate signals in parallel with partial results callback
      const signals = await signalAggregator.aggregateSignals(
        competitorList, 
        urlList, 
        sources,
        (partialResults) => {
          const streamRes = streamingSessions.get(streamSessionId);
          if (streamRes) {
            streamRes.write(`data: ${JSON.stringify({
              type: "partial_results",
              data: partialResults,
              progress: 50
            })}\n\n`);
          }
        }
      );
      
      // Send signals collected update
      if (streamRes) {
        streamRes.write(`data: ${JSON.stringify({
          type: "progress",
          message: "Analyzing with AI...",
          progress: 70
        })}\n\n`);
      }
      
      // Generate fast preview first
      let summary;
      try {
        const fastPreview = await generateFastPreview(signals, competitorList);
        
        // Send preview to stream
        if (streamRes) {
          streamRes.write(`data: ${JSON.stringify({
            type: "preview",
            data: fastPreview,
            progress: 85
          })}\n\n`);
        }
        
        // Then generate full summary
        summary = await summarizeCompetitorSignals(signals, competitorList, false);
        
        // Send completion
        if (streamRes) {
          streamRes.write(`data: ${JSON.stringify({
            type: "complete",
            progress: 100
          })}\n\n`);
        }
        
      } catch (error) {
        console.error("AI analysis error:", error);
        // Fallback to basic summary
        summary = await summarizeCompetitorSignals(signals, competitorList, false);
      }
      
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
        
        // Automatically send email to user after report is created
        const userEmail = req.user.claims.email;
        if (userEmail) {
          try {
            await sendCompetitorReport({
              to: userEmail,
              reportTitle: report.title,
              reportContent: report.summary,
              competitors: report.competitors as string[]
            });
            console.log(`Report email sent automatically to ${userEmail}`);
          } catch (error) {
            console.error('Failed to send automatic email:', error);
            // Don't fail the entire request if email fails
          }
        }
      } else {
        // Return temporary report for guests
        report = {
          ...reportData,
          id: `temp_${Date.now()}`,
          createdAt: new Date(),
        };
      }
      
      // Clean up streaming session
      streamingSessions.delete(streamSessionId);
      
      res.json(report);
    } catch (error) {
      console.error("Error analyzing competitors:", error);
      
      // Clean up streaming session on error
      const errorStreamSessionId = `${req.sessionID}_${Date.now()}`;
      streamingSessions.delete(errorStreamSessionId);
      
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

  // Tracked Competitors API
  
  // Get user's tracked competitors
  app.get('/api/competitors/tracked', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trackedCompetitors = await storage.getUserTrackedCompetitors(userId);
      const count = await storage.getTrackedCompetitorCount(userId);
      
      res.json({
        competitors: trackedCompetitors,
        count,
        limit: 5
      });
    } catch (error) {
      console.error("Error fetching tracked competitors:", error);
      res.status(500).json({ message: "Failed to fetch tracked competitors" });
    }
  });
  
  // Add a tracked competitor
  app.post('/api/competitors/tracked', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const validation = insertTrackedCompetitorSchema.safeParse({
        userId,
        ...req.body
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.issues 
        });
      }
      
      // Check if competitor already exists
      const existingCompetitors = await storage.getUserTrackedCompetitors(userId);
      const competitorExists = existingCompetitors.some(
        c => c.competitorName.toLowerCase() === validation.data.competitorName.toLowerCase()
      );
      
      if (competitorExists) {
        return res.status(400).json({ 
          message: "This competitor is already being tracked" 
        });
      }
      
      // Check limit (5 competitors max)
      const currentCount = await storage.getTrackedCompetitorCount(userId);
      if (currentCount >= 5) {
        return res.status(400).json({ 
          message: "You can track up to 5 competitors. Remove one to add another." 
        });
      }
      
      const newCompetitor = await storage.addTrackedCompetitor(validation.data);
      res.json(newCompetitor);
    } catch (error) {
      console.error("Error adding tracked competitor:", error);
      res.status(500).json({ message: "Failed to add competitor" });
    }
  });
  
  // Remove a tracked competitor
  app.delete('/api/competitors/tracked/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      await storage.removeTrackedCompetitor(userId, id);
      res.json({ message: "Competitor removed successfully" });
    } catch (error) {
      console.error("Error removing tracked competitor:", error);
      res.status(500).json({ message: "Failed to remove competitor" });
    }
  });

  // Analyze tracked competitors (for automated weekly analysis)
  app.post('/api/competitors/tracked/analyze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's tracked competitors
      const trackedCompetitors = await storage.getUserTrackedCompetitors(userId);
      
      if (trackedCompetitors.length === 0) {
        return res.status(400).json({ 
          message: "No competitors are being tracked" 
        });
      }
      
      // Prepare competitors list
      const competitorList = trackedCompetitors.map(c => c.competitorName);
      
      // Default sources for tracked competitor analysis
      const sources = {
        news: true,
        funding: true,
        social: true,
        products: false,
      };
      
      // Aggregate signals
      const signals = await signalAggregator.aggregateSignals(
        competitorList, 
        [], // No custom URLs for tracked analysis
        sources
      );
      
      // Generate AI summary
      const summary = await summarizeCompetitorSignals(signals, competitorList, false);
      
      // Create report
      const reportData = {
        userId,
        title: `Weekly Tracked Competitors Analysis - ${new Date().toLocaleDateString()}`,
        competitors: competitorList,
        signals,
        summary,
        metadata: {
          signalCount: signals.reduce((acc: number, s: any) => acc + s.items.length, 0),
          sources: Object.keys(sources).filter(key => sources[key as keyof typeof sources]),
          generatedAt: new Date().toISOString(),
          isWeeklyAnalysis: true,
        },
      };
      
      const report = await storage.createReport(reportData);
      
      // Update lastAnalyzedAt for all tracked competitors
      for (const competitor of trackedCompetitors) {
        // This would require updating the storage interface to support this
        // For now, we'll skip this step as it's not critical for the MVP
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error analyzing tracked competitors:", error);
      res.status(500).json({ message: "Failed to analyze tracked competitors" });
    }
  });

  // Email report endpoint
  app.post('/api/reports/:reportId/email', isAuthenticated, async (req: any, res) => {
    try {
      const { reportId } = req.params;
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      if (!userEmail) {
        return res.status(400).json({ message: "User email not found" });
      }
      
      // Get the report
      const report = await storage.getReport(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Verify the report belongs to the user
      if (report.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Send the email
      const emailResult = await sendCompetitorReport({
        to: userEmail,
        reportTitle: report.title,
        reportContent: report.summary,
        competitors: report.competitors as string[]
      });
      
      if (emailResult.success) {
        res.json({ 
          success: true, 
          message: "Report sent successfully to your email",
          emailId: emailResult.id 
        });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      console.error("Error sending email report:", error);
      res.status(500).json({ message: "Failed to send email report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
