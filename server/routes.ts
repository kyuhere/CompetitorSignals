import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCompetitorReportSchema, insertTrackedCompetitorSchema } from "@shared/schema";
import { z } from "zod";
import { signalAggregator } from "./services/signalAggregator";
import { redditSentimentService } from "./services/redditSentiment";
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
      const isLoggedIn = !!userId;
      
      const limit = 3; // Maximum 3 tracked competitors
      let current = 0;
      
      if (isLoggedIn) {
        current = await storage.getTrackedCompetitorCount(userId);
      }
      
      const remaining = Math.max(0, limit - current);
      
      res.json({
        current,
        limit,
        remaining,
        isLoggedIn,
        isTrackingBased: true,
        resetTime: new Date(), // Not applicable for tracking-based limits
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
      
      // Check tracked competitor limits for logged-in users
      const limit = 3; // Maximum 3 tracked competitors
      
      if (isLoggedIn) {
        const currentTrackedCount = await storage.getTrackedCompetitorCount(userId);
        
        // Check if user has reached the tracking limit
        if (currentTrackedCount >= limit) {
          return res.status(400).json({ 
            message: "You can track up to 3 competitors. Remove one to analyze another.",
            limit,
            current: currentTrackedCount,
            isTrackingLimit: true,
          });
        }
        
        // Check if adding these competitors would exceed the limit
        if (currentTrackedCount + competitorList.length > limit) {
          return res.status(400).json({ 
            message: `Adding ${competitorList.length} competitors would exceed your limit of ${limit}. You currently track ${currentTrackedCount} competitors.`,
            limit,
            current: currentTrackedCount,
            requested: competitorList.length,
            isTrackingLimit: true,
          });
        }
      } else {
        // Guests can still do unlimited analyses for testing
        if (competitorList.length > 5) {
          return res.status(400).json({ 
            message: `You can analyze up to 5 competitors as a guest.`,
            limit: 5,
            requested: competitorList.length,
          });
        }
      }
      
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
      
      // Get Reddit sentiment analysis for the first competitor
      let redditSentiment = null;
      if (competitorList.length > 0) {
        if (streamRes) {
          streamRes.write(`data: ${JSON.stringify({
            type: "progress",
            message: "Analyzing Reddit sentiment...",
            progress: 60
          })}\n\n`);
        }
        
        try {
          redditSentiment = await redditSentimentService.getRedditSentiment(competitorList[0]);
          console.log(`Reddit sentiment analysis completed for ${competitorList[0]}`);
        } catch (error) {
          console.error('Reddit sentiment analysis failed:', error);
          // Continue without Reddit data if it fails
        }
      }
      
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
          hasRedditAnalysis: !!redditSentiment,
          redditSentiment: redditSentiment,
        },
      };
      
      let report;
      if (isLoggedIn) {
        // Save report for logged-in users
        report = await storage.createReport(reportData);
        
        // Add competitors to tracking automatically
        for (const competitorName of competitorList) {
          try {
            // Check if this competitor is already being tracked
            const existingCompetitors = await storage.getUserTrackedCompetitors(userId);
            const isAlreadyTracked = existingCompetitors.some(
              c => c.competitorName.toLowerCase() === competitorName.toLowerCase()
            );
            
            if (!isAlreadyTracked) {
              await storage.addTrackedCompetitor({
                userId,
                competitorName,
                isActive: true,
              });
            }
          } catch (error) {
            console.error(`Failed to add ${competitorName} to tracking:`, error);
            // Continue with other competitors even if one fails
          }
        }
        
        // Automatically send email to user after report is created
        const userEmail = req.user.claims.email;
        if (userEmail) {
          try {
            await sendCompetitorReport({
              to: userEmail,
              reportTitle: report.title,
              reportContent: report.summary,
              competitors: report.competitors as string[],
              redditSentiment: (report.metadata as any)?.redditSentiment
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
        limit: 3
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
      
      // Check if competitor already exists (only active ones)
      const existingCompetitors = await storage.getUserTrackedCompetitors(userId);
      const competitorExists = existingCompetitors.some(
        c => c.competitorName.toLowerCase() === validation.data.competitorName.toLowerCase()
      );
      
      if (competitorExists) {
        return res.status(400).json({ 
          message: "This competitor is already being tracked" 
        });
      }
      
      // Check limit (3 competitors max)
      const currentCount = await storage.getTrackedCompetitorCount(userId);
      if (currentCount >= 3) {
        return res.status(400).json({ 
          message: "You can track up to 3 competitors. Remove one to add another." 
        });
      }
      
      const newCompetitor = await storage.addTrackedCompetitor(validation.data);
      res.json(newCompetitor);
    } catch (error) {
      console.error("Error adding tracked competitor:", error);
      res.status(500).json({ message: "Failed to add competitor" });
    }
  });
  
  // Remove a tracked competitor (with monthly lock)
  app.delete('/api/competitors/tracked/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Get the competitor to check when it was added
      const competitor = await storage.getTrackedCompetitorById(userId, id);
      if (!competitor) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Check if competitor was added this month (locked until end of month)
      const addedDate = new Date(competitor.addedAt!);
      const now = new Date();
      
      // Check if added in the current month
      if (addedDate.getMonth() === now.getMonth() && addedDate.getFullYear() === now.getFullYear()) {
        // Calculate end of current month
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const daysRemaining = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return res.status(400).json({ 
          message: "Competitors are locked until the end of the month",
          locked: true,
          daysRemaining,
          unlockDate: endOfMonth.toISOString(),
          canUpgrade: true,
          competitorId: id
        });
      }
      
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
  app.post('/api/reports/:reportId/email', async (req: any, res) => {
    try {
      const { reportId } = req.params;
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address format" });
      }
      
      // Get the report
      const report = await storage.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Send the email
      console.log(`Attempting to send report ${reportId} to ${email}`);
      const emailResult = await sendCompetitorReport({
        to: email,
        reportTitle: report.title,
        reportContent: report.summary,
        competitors: report.competitors as string[]
      });
      
      if (emailResult.success) {
        console.log(`Email sent successfully to ${email}, ID: ${emailResult.id}`);
        res.json({ 
          success: true, 
          message: "Report sent successfully to your email",
          emailId: emailResult.id 
        });
      } else {
        console.error(`Email failed for ${email}:`, emailResult.error);
        res.status(500).json({ 
          message: "Failed to send email",
          error: emailResult.error
        });
      }
    } catch (error) {
      console.error("Error sending email report:", error);
      res.status(500).json({ message: "Failed to send email report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
