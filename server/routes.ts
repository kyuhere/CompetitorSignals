import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupLocalAuth, requireLocalAuth, requirePremium } from "./localAuth";
import { requireAnyAuth, requirePremiumAny, addAuthContext, getAuthContext } from "./utils/unified-auth";
import { insertCompetitorReportSchema, insertTrackedCompetitorSchema } from "@shared/schema";
import { z } from "zod";
import { signalAggregator } from "./services/signalAggregator";
import { enhancedSignalAggregator } from "./services/enhancedSignalAggregator";

import { summarizeCompetitorSignals, generateFastPreview } from "./services/openai";
import { trustpilotService } from "./services/trustpilot";
import { sendCompetitorReport } from "./email";

// Store active streaming sessions
const streamingSessions = new Map<string, any>();

// In-memory cache for repeated analyses (15 min TTL)
type CachedPayload = {
  signals: any[];
  enhancedData: any[];
  summary: any; // stringified JSON or object
  hasG2Reviews: boolean;
  hasHNSentiment: boolean;
};
const ANALYSIS_TTL_MS = 15 * 60 * 1000;
const analysisCache = new Map<string, { payload: CachedPayload; expires: number }>();
const normalizeList = (arr: string[]) => arr.map(s => s.trim().toLowerCase()).filter(Boolean).sort();
const makeCacheKey = (competitors: string[], urls: string[], sources: any, mode: 'premium'|'free', domains: string[] = []) => {
  const src = [sources?.news && 'news', sources?.funding && 'funding', sources?.social && 'social', sources?.products && 'products']
    .filter(Boolean)
    .join(',');
  const dom = domains.map(d => (d || '').trim().toLowerCase()).join('|');
  return `competitors:${normalizeList(competitors).join('|')}|domains:${dom}|urls:${normalizeList(urls).join('|')}|src:${src}|mode:${mode}`;
};

const competitorAnalysisSchema = z.object({
  competitors: z.string().min(1, "At least one competitor is required"),
  urls: z.string().optional(),
  sources: z.object({
    news: z.boolean().default(true),
    funding: z.boolean().default(true),
    social: z.boolean().default(true),
    products: z.boolean().default(false),
  }).default({ news: true, funding: true, social: true, products: false }),
  nocache: z.boolean().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware - Both Replit Auth and Local Auth
  await setupAuth(app);
  setupLocalAuth(app);

  // Debug endpoint to inspect Trustpilot parsing
  app.get('/api/debug/trustpilot', async (req: any, res: any) => {
    try {
      const domain = String(req.query.domain || '').trim();
      if (!domain) {
        return res.status(400).json({ message: 'Provide ?domain=example.com' });
      }
      const parsed = await trustpilotService.getCompanyReviewsByDomain(domain);
      return res.json({ domain, parsed });
    } catch (err: any) {
      console.error('[Debug] trustpilot error:', err?.message || err);
      return res.status(500).json({ message: 'Debug failed', error: err?.message || String(err) });
    }
  });

  // Auth routes - now supports both Replit Auth and Local Auth
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = authContext.user!;

      // Sanitize user data - remove sensitive fields before sending to client
      const { passwordHash, ...safeUser } = user;

      // Check if there's a guest search to migrate
      const guestSearchData = req.headers['x-guest-search'];
      if (guestSearchData) {
        try {
          const guestReport = JSON.parse(guestSearchData as string);
          if (guestReport && guestReport.id && guestReport.id.startsWith('temp_')) {
            // Convert guest report to permanent report
            const reportData = {
              userId: authContext.userId!,
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

      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Helper function to get competitor limits by plan
  const getPlanLimits = (plan: string) => {
    switch (plan) {
      case 'premium':
        return { tracked: 10, analysis: 10 };
      case 'free':
      default:
        return { tracked: 3, analysis: 3 };
    }
  };

  // Determine effective plan with fallbacks
  const getEffectivePlan = (user: any, req: any): string => {
    const claimedPlan = (req?.user?.claims?.plan as string) || undefined;
    let plan = (user?.plan as string) || claimedPlan || 'free';
    return plan;
  };

  // Get user usage stats - now supports both auth methods
  app.get('/api/usage', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      const isLoggedIn = authContext.isAuthenticated;
      const userId = authContext.userId;

      let plan = authContext.plan || 'free';
      let limit = 3; // Guest limit
      let current = 0;

      if (isLoggedIn && userId) {
        // Get user's plan from database
        const user = await storage.getUser(userId);
        plan = getEffectivePlan(user, req);
        const planLimits = getPlanLimits(plan);
        limit = planLimits.tracked;
        current = await storage.getTrackedCompetitorCount(userId);
      }

      const remaining = Math.max(0, limit - current);

      res.json({
        current: Number(current),
        limit: Number(limit),
        remaining: Number(remaining),
        plan,
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

  // Analyze competitors - now supports both auth methods
  app.post('/api/analyze', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      const userId = authContext.userId;
      const sessionId = req.sessionID;
      const isLoggedIn = authContext.isAuthenticated;

      // Validate request
      const validation = competitorAnalysisSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validation.error.issues
        });
      }

      const { competitors, urls, sources } = validation.data;

      // Parse competitors with optional domains (formats supported per line):
      // "Name, domain.com" | "domain.com" | "Name"
      const rawLines = competitors
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const domainRegex = /(?:^|[\s,])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,}))+(?=$|[\s,])/i;
      const toTitleCase = (s: string) => s.replace(/(^|\s|[-_])(\w)/g, (_, p1, p2) => (p1 || '') + p2.toUpperCase());
      const nameFromDomain = (domain: string) => {
        const host = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        const base = host.split('/')[0].split('.')[0].replace(/[-_]/g, ' ');
        return toTitleCase(base);
      };

      const pairs = rawLines.map(line => {
        const m = line.match(domainRegex);
        const domain = m && m[1] ? m[1].toLowerCase() : null;
        if (domain && m && m[1]) {
          const before = line.split(m[1])[0].replace(/[,\s]+$/, '').trim();
          const hasName = before.length > 0;
          const name = hasName ? before : nameFromDomain(domain);
          return { name, domain };
        }
        return { name: line, domain: null as string | null };
      });

      // Dedupe by canonical identity to avoid treating variants as separate
      const toCanonical = (s: string) => {
        const lower = (s || '').trim().toLowerCase();
        const noProto = lower.replace(/^https?:\/\//, '').replace(/^www\./, '');
        const firstToken = noProto.split('/')[0];
        const baseLabel = firstToken.includes('.') ? firstToken.split('.')[0] : firstToken;
        return baseLabel.replace(/[^a-z0-9]/g, '');
      };
      const uniqueByCanonical = new Map<string, { name: string; domain: string | null }>();
      for (const p of pairs) {
        const canon = toCanonical(p.domain || p.name);
        if (!canon) continue;
        if (!uniqueByCanonical.has(canon)) {
          uniqueByCanonical.set(canon, p);
        }
      }
      const deduped = Array.from(uniqueByCanonical.values());

      const competitorList = deduped.map(p => p.name);
      const domainsByCompetitor: Record<string, string | null> = pairs.reduce((acc, p) => {
        acc[p.name] = p.domain;
        acc[p.name.toLowerCase()] = p.domain;
        return acc;
      }, {} as Record<string, string | null>);

      // Get user plan and limits
      let plan = 'free';
      let limit = 3; // Default guest limit

      if (isLoggedIn && userId) {
        const user = await storage.getUser(userId);
        plan = getEffectivePlan(user, req);
        const planLimits = getPlanLimits(plan);
        limit = planLimits.tracked;

        const currentTrackedCount = await storage.getTrackedCompetitorCount(userId);
        const trackedCompetitors = await storage.getUserTrackedCompetitors(userId);
        const trackedCanon = new Set(trackedCompetitors.map(c => toCanonical(c.competitorName)));

        // For logging purposes only, determine new vs existing by canonical identity
        const newCompetitors = competitorList.filter(name => !trackedCanon.has(toCanonical(name)));
        const existingCompetitors = competitorList.filter(name => trackedCanon.has(toCanonical(name)));

        // Do NOT block analysis due to tracking limits. We only log potential overage.
        if (newCompetitors.length > 0 && currentTrackedCount + newCompetitors.length > limit) {
          console.log(`[Analyze] Tracking limit would be exceeded if auto-tracking new competitors:`, { limit, currentTrackedCount, newCompetitors });
        }

        // Analysis proceeds regardless; client may separately attempt auto-track per competitor
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

      // Plan-aware caching (bypass with ?nocache=1)
      const analysisMode: 'premium' | 'free' = (isLoggedIn && plan === 'premium') ? 'premium' : 'free';
      const domainListForCache = Array.from(uniqueByCanonical.values()).map(p => p.domain || '');
      const cacheKey = makeCacheKey(competitorList, urlList, sources, analysisMode, domainListForCache);
      const bypassCache = String(req.query?.nocache || '') === '1' || !!validation.data.nocache;
      const preferFreshEnhanced = (analysisMode === 'premium') && domainListForCache.some(Boolean);
      let cached = !bypassCache ? analysisCache.get(cacheKey) : undefined;
      if (cached && preferFreshEnhanced) {
        console.log('[Routes] Bypassing cache for premium analysis with domains to fetch fresh enhanced data');
        cached = undefined;
      }
      let fromCache = false;

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

      // Always use enhanced aggregator for all plans (ensures review data exists for overlay gating)
      let signals: any[] = [];
      let enhancedData: any[] = [];
      let summary: any = undefined;
      let hasG2Reviews: boolean = false;
      let hasHNSentiment: boolean = false;

      if (cached && cached.expires > Date.now()) {
        ({ signals, enhancedData, summary, hasG2Reviews, hasHNSentiment } = cached.payload);
        fromCache = true;
        console.log(`[Routes] Cache hit for analyze key=${cacheKey}`);
      } else {
        console.log(`[Routes] Using enhanced aggregator for: ${competitorList.join(', ')} (plan=${plan}, loggedIn=${isLoggedIn}, mode=${analysisMode})`);
        const enhancedResults = await enhancedSignalAggregator.aggregateEnhancedSignals(
          competitorList,
          urlList,
          sources,
          (partialResults) => {
            const streamRes = streamingSessions.get(streamSessionId);
            if (streamRes) {
              streamRes.write(`data: ${JSON.stringify({
                type: "partial_results",
                data: (partialResults as any).traditional || partialResults,
                progress: 50
              })}\n\n`);
            }
          },
          { mode: analysisMode, computeSentiment: analysisMode === 'premium', domainsByCompetitor }
        );
        signals = enhancedResults.traditional || [];
        enhancedData = enhancedResults.enhanced || [];
        console.log(`[Routes] Aggregation complete:`, {
          traditionalSignals: signals?.length || 0,
          enhancedDataCount: enhancedData?.length || 0,
          enhancedCompetitors: enhancedData?.map((d: any) => d.competitor) || []
        });
      }



      // Send signals collected update
      if (streamRes) {
        streamRes.write(`data: ${JSON.stringify({
          type: "progress",
          message: "Analyzing with AI...",
          progress: 70
        })}\n\n`);
      }

      // Generate analysis with enhanced data (skip if from cache)
      try {
        if (!summary && analysisMode === 'premium' && enhancedData && enhancedData.length > 0) {
          // Premium users get enhanced analysis including review and sentiment data
          const fastPreview = await generateFastPreview(signals, competitorList);

          // Send preview to stream
          if (streamRes) {
            streamRes.write(`data: ${JSON.stringify({
              type: "preview",
              data: fastPreview,
              progress: 85
            })}\n\n`);
          }

          // Generate structured summary (same schema as free) using premium model depth
          summary = await summarizeCompetitorSignals(signals, competitorList, true);

        } else if (!summary) {
          // Free users and guests get traditional analysis
          const fastPreview = await generateFastPreview(signals, competitorList);

          // Send preview to stream
          if (streamRes) {
            streamRes.write(`data: ${JSON.stringify({
              type: "preview",
              data: fastPreview,
              progress: 85
            })}\n\n`);
          }

          // Generate traditional summary
          summary = await summarizeCompetitorSignals(signals, competitorList, false);
        }

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

      // Create report with enhanced data
      // Backward-compat flag: compute from Trustpilot (or legacy G2) so frontend gating remains consistent
      hasG2Reviews = typeof hasG2Reviews === 'boolean' ? hasG2Reviews : !!(enhancedData && enhancedData.some((d: any) =>
        (d.trustpilot && d.trustpilot.totalReviews > 0) || (d.g2 && d.g2.totalReviews > 0)
      ));
      hasHNSentiment = typeof hasHNSentiment === 'boolean' ? hasHNSentiment : !!(enhancedData && enhancedData.some((d: any) => d.hackerNews && d.hackerNews.totalMentions > 0));

      console.log(`[Routes] Creating report metadata:`, {
        enhancedDataLength: enhancedData?.length || 0,
        hasG2Reviews,
        hasHNSentiment,
        enhancedDataSample: enhancedData?.slice(0, 2)
      });

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
          enhanced: {
            reviewData: enhancedData,
            hasG2Reviews,
            hasHNSentiment,
            locked: plan !== 'premium'
          },
        },
      };

      let report;
      if (isLoggedIn && userId) {
        // Save report for logged-in users
        report = await storage.createReport(reportData);

        // Add competitors to tracking automatically (canonical dedupe; skip if at limit)
        try {
          const existingCompetitors = await storage.getUserTrackedCompetitors(userId);
          const existingCanon = new Set(existingCompetitors.map(c => toCanonical(c.competitorName)));
          let currentCount = await storage.getTrackedCompetitorCount(userId);

          for (const competitorName of competitorList) {
            const canon = toCanonical(competitorName);
            if (!canon) continue;

            if (existingCanon.has(canon)) {
              continue; // already tracked canonically
            }

            if (currentCount >= limit) {
              console.log(`[Analyze] Skip auto-track due to limit: ${competitorName} (limit=${limit})`);
              continue;
            }

            try {
              await storage.addTrackedCompetitor({
                userId,
                competitorName,
                isActive: true,
              });
              existingCanon.add(canon);
              currentCount += 1;
            } catch (error) {
              console.error(`Failed to add ${competitorName} to tracking:`, error);
            }
          }
        } catch (err) {
          console.error('Auto-track step failed:', err);
        }

        // Automatically send email to user after report is created (premium users only)
        const userEmail = authContext.user?.email;
        if (userEmail && plan === 'premium') {
          try {
            await sendCompetitorReport({
              to: userEmail,
              reportTitle: report.title,
              reportContent: report.summary,
              competitors: report.competitors as string[]
            });
            console.log(`Report email sent automatically to ${userEmail} (premium user)`);
          } catch (error) {
            console.error('Failed to send automatic email:', error);
            // Don't fail the entire request if email fails
          }
        } else if (userEmail && plan !== 'premium') {
          console.log(`Skipping automatic email for free user: ${userEmail}`);
        }
      } else {
        // Return temporary report for guests
        report = {
          ...reportData,
          id: `temp_${Date.now()}`,
          createdAt: new Date(),
        };
      }

      // Update cache on miss
      if (!fromCache && signals && enhancedData && summary) {
        analysisCache.set(cacheKey, {
          payload: { signals, enhancedData, summary, hasG2Reviews: !!hasG2Reviews, hasHNSentiment: !!hasHNSentiment },
          expires: Date.now() + ANALYSIS_TTL_MS,
        });
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

  // Get user reports - supports both auth methods
  app.get('/api/reports', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;
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

  // Get user's tracked competitors - supports both auth methods
  app.get('/api/competitors/tracked', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;
      const trackedCompetitors = await storage.getUserTrackedCompetitors(userId);
      const count = await storage.getTrackedCompetitorCount(userId);

      // Determine plan-based limit
      const user = await storage.getUser(userId);
      const plan = getEffectivePlan(user, req);
      const planLimits = getPlanLimits(plan);

      res.json({
        competitors: trackedCompetitors,
        count,
        limit: planLimits.tracked
      });
    } catch (error) {
      console.error("Error fetching tracked competitors:", error);
      res.status(500).json({ message: "Failed to fetch tracked competitors" });
    }
  });

  // Add a tracked competitor - supports both auth methods
  app.post('/api/competitors/tracked', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;

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

      // Check if competitor already exists (canonical match, treats name and domain variants the same)
      const existingCompetitors = await storage.getUserTrackedCompetitors(userId);
      const toCanonical = (s: string) => {
        const lower = (s || '').trim().toLowerCase();
        // If it looks like a URL or domain, extract base label before first dot
        const noProto = lower.replace(/^https?:\/\//, '').replace(/^www\./, '');
        const firstToken = noProto.split('/')[0];
        const baseLabel = firstToken.includes('.') ? firstToken.split('.')[0] : firstToken;
        return baseLabel.replace(/[^a-z0-9]/g, '');
      };
      const requestedCanonical = toCanonical(validation.data.competitorName);
      const existingCanonicalSet = new Set(existingCompetitors.map(c => toCanonical(c.competitorName)));
      const competitorExists = existingCanonicalSet.has(requestedCanonical);

      if (competitorExists) {
        // Idempotent success: return the existing competitor with 200
        const existing = existingCompetitors.find(
          c => toCanonical(c.competitorName) === requestedCanonical
        );
        return res.status(200).json({
          ...existing,
          alreadyTracked: true
        });
      }

      // Determine plan-based limit
      const user = await storage.getUser(userId);
      const plan = authContext.plan || 'free';
      const planLimits = getPlanLimits(plan);

      // Check limit (plan-based)
      const currentCount = await storage.getTrackedCompetitorCount(userId);
      if (currentCount >= planLimits.tracked) {
        return res.status(400).json({
          message: `You can track up to ${planLimits.tracked} competitors with your current plan (${plan}). Remove one to add another.`,
          limit: planLimits.tracked,
          current: currentCount,
          plan
        });
      }

      const newCompetitor = await storage.addTrackedCompetitor(validation.data);
      res.json(newCompetitor);
    } catch (error) {
      console.error("Error adding tracked competitor:", error);
      res.status(500).json({ message: "Failed to add competitor" });
    }
  });

  // Remove a tracked competitor (with monthly lock for free users only) - supports both auth methods
  app.delete('/api/competitors/tracked/:id', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;
      const { id } = req.params;

      // Get the competitor to check when it was added
      const competitor = await storage.getTrackedCompetitorById(userId, id);
      if (!competitor) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      // Get user plan to determine if monthly lock applies
      const user = await storage.getUser(userId);
      const plan = getEffectivePlan(user, req);
      
      // Only apply monthly lock for free users
      if (plan !== 'premium') {
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
      }

      await storage.removeTrackedCompetitor(userId, id);
      res.json({ message: "Competitor removed successfully" });
    } catch (error) {
      console.error("Error removing tracked competitor:", error);
      res.status(500).json({ message: "Failed to remove competitor" });
    }
  });

  // Analyze tracked competitors (for automated weekly analysis) - supports both auth methods
  app.post('/api/competitors/tracked/analyze', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;

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

  // Quick Summary for Tracked Competitors
  app.post('/api/competitors/tracked/quick-summary', async (req: any, res) => {
    try {
      const authContext = await getAuthContext(req);
      
      if (!authContext.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = authContext.userId!;

      // Get user's tracked competitors
      const trackedCompetitors = await storage.getUserTrackedCompetitors(userId);

      if (trackedCompetitors.length === 0) {
        return res.status(400).json({
          message: "No competitors are being tracked"
        });
      }

      // Extract competitor names and build canonical set key
      const competitorList = trackedCompetitors.map(c => c.competitorName);
      
      // Reuse the canonicalization logic from analyze endpoint
      const toCanonical = (s: string) => {
        const lower = (s || '').trim().toLowerCase();
        const noProto = lower.replace(/^https?:\/\//, '').replace(/^www\./, '');
        const firstToken = noProto.split('/')[0];
        const baseLabel = firstToken.includes('.') ? firstToken.split('.')[0] : firstToken;
        return baseLabel.replace(/[^a-z0-9]/g, '');
      };

      const canonicalCompetitors = competitorList.map(toCanonical).sort();
      const canonicalKey = `tracked_qs:${canonicalCompetitors.join('|')}`;

      // Try to reuse a recent matching report (within 14 days)
      const reports = await storage.getUserReports(userId, 10);
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      let reusableReport = null;
      for (const report of reports) {
        if (report.createdAt && new Date(report.createdAt) > fourteenDaysAgo) {
          // Check if this report has the same canonical competitor set
          const reportCompetitors = (report.competitors as string[]) || [];
          const reportCanonical = reportCompetitors.map(toCanonical).sort();
          const reportKey = `tracked_qs:${reportCanonical.join('|')}`;
          
          if (reportKey === canonicalKey) {
            reusableReport = report;
            break;
          }
        }
      }

      let compactPayload: any;
      let reportId: string;
      let createdAtISO: string | undefined;

      if (reusableReport) {
        // Reuse existing report data, but persist a new compact quick-summary report for consistency/UI
        let existingSummary;
        try {
          existingSummary = typeof reusableReport.summary === 'string' 
            ? JSON.parse(reusableReport.summary) 
            : reusableReport.summary;
        } catch {
          existingSummary = reusableReport.summary;
        }

        // Check if this is already a compact summary or needs to be converted
        if (existingSummary.executiveSummary || existingSummary.executive_summary) {
          // Already compact format or fast preview format
          compactPayload = {
            meta: { 
              generatedAt: reusableReport.createdAt,
              competitorCount: competitorList.length, 
              canonicalKey,
              reused: true 
            },
            executiveSummary: existingSummary.executiveSummary || existingSummary.executive_summary,
            competitorSnippets: existingSummary.competitorSnippets || (existingSummary.competitor_insights || []).map((insight: any) => ({
              competitor: insight.competitor,
              bullets: [insight.key_update || "No recent updates"]
            })),
            topSignals: existingSummary.topSignals || existingSummary.top_signals || ["No significant signals found"]
          };
        } else {
          // Convert full analysis to compact format
          const competitors = existingSummary.competitors || [];
          compactPayload = {
            meta: { 
              generatedAt: reusableReport.createdAt,
              competitorCount: competitorList.length, 
              canonicalKey,
              reused: true 
            },
            executiveSummary: existingSummary.executive_summary || "Competitive landscape analysis available.",
            competitorSnippets: competitors.slice(0, 5).map((comp: any) => ({
              competitor: comp.competitor || "Unknown",
              bullets: (comp.recent_developments || ["No recent developments"]).slice(0, 2)
            })),
            topSignals: existingSummary.strategic_insights?.slice(0, 3) || ["Analysis available in full report"]
          };
        }
        
        // Ensure every tracked competitor has a snippet entry
        const existingNames = new Set<string>((compactPayload.competitorSnippets || []).map((s: any) => (s.competitor || '').toString().toLowerCase()));
        for (const name of competitorList) {
          if (!existingNames.has((name || '').toString().toLowerCase())) {
            compactPayload.competitorSnippets = compactPayload.competitorSnippets || [];
            compactPayload.competitorSnippets.push({
              competitor: name,
              bullets: ["No major updates detected in the last 2 weeks", "Monitoring for new signals"]
            });
          }
        }

        // Add or normalize strategic insights
        if (!compactPayload.strategicInsights) {
          const insights = (
            existingSummary.strategic_insights ||
            existingSummary.top_signals ||
            existingSummary.topSignals ||
            compactPayload.topSignals ||
            []
          ).slice(0, 5);
          if (Array.isArray(insights) && insights.length > 0) {
            compactPayload.strategicInsights = insights;
          }
        }

        // Persist as a new quick-summary report (do not overwrite the original)
        const persisted = await storage.createReport({
          userId,
          title: `Quick Summary (Tracked) — ${new Date().toLocaleDateString()}`,
          competitors: competitorList,
          signals: [],
          summary: JSON.stringify(compactPayload),
          metadata: {
            ...compactPayload.meta,
            type: 'quick_summary',
            reusedFromReportId: reusableReport.id,
            signalCount: 0,
            sources: ['news', 'funding', 'social']
          }
        });
        reportId = persisted.id;
        createdAtISO = persisted.createdAt ? new Date(persisted.createdAt).toISOString() : undefined;
      } else {
        // Generate fresh quick summary
        const sources = {
          news: true,
          funding: true,
          social: true,
          products: false
        };

        // Aggregate signals (lightweight for quick summary)
        const signals = await signalAggregator.aggregateSignals(
          competitorList,
          [], // No custom URLs
          sources
        );

        // Generate fast preview
        const preview = await generateFastPreview(signals, competitorList);
        const parsedPreview = JSON.parse(preview);

        // Build compact payload
        compactPayload = {
          meta: { 
            generatedAt: new Date().toISOString(), 
            competitorCount: competitorList.length, 
            canonicalKey,
            reused: false
          },
          executiveSummary: parsedPreview.executive_summary || "Competitive intelligence summary generated.",
          competitorSnippets: (parsedPreview.competitor_insights || []).map((insight: any) => ({
            competitor: insight.competitor,
            bullets: [
              insight.key_update || "Activity level: " + (insight.activity_level || "unknown")
            ]
          })),
          topSignals: parsedPreview.top_signals || ["Analysis complete"],
          strategicInsights: parsedPreview.strategic_insights || []
        };

        // Enrich bullets with recent signal titles per competitor (up to 2 more)
        try {
          const itemsByCompetitor = new Map<string, string[]>();
          for (const group of signals) {
            const comp = (group.competitor || '').toString();
            if (!comp) continue;
            const titles = (group.items || []).map((it: any) => it.title).filter(Boolean);
            if (!itemsByCompetitor.has(comp)) itemsByCompetitor.set(comp, []);
            itemsByCompetitor.set(comp, [...(itemsByCompetitor.get(comp) || []), ...titles]);
          }
          for (const snippet of compactPayload.competitorSnippets) {
            const titles = itemsByCompetitor.get(snippet.competitor) || [];
            const extras = titles.slice(0, 2);
            snippet.bullets = [...(snippet.bullets || []), ...extras].slice(0, 3);
          }
        } catch {}

        // Ensure every tracked competitor has a snippet entry
        const present = new Set<string>((compactPayload.competitorSnippets || []).map((s: any) => (s.competitor || '').toString().toLowerCase()));
        for (const name of competitorList) {
          if (!present.has((name || '').toString().toLowerCase())) {
            (compactPayload.competitorSnippets = compactPayload.competitorSnippets || []).push({
              competitor: name,
              bullets: ["No major updates detected in the last 2 weeks", "Monitoring for new signals"]
            });
          }
        }

        // If strategic insights empty, derive from top signals
        if (!compactPayload.strategicInsights || compactPayload.strategicInsights.length === 0) {
          compactPayload.strategicInsights = (compactPayload.topSignals || []).slice(0, 5);
        }

        // Persist as new report
        const reportData = {
          userId,
          title: `Quick Summary (Tracked) — ${new Date().toLocaleDateString()}`,
          competitors: competitorList,
          signals: [], // Quick summary is analysis-only
          summary: JSON.stringify(compactPayload),
          metadata: {
            ...compactPayload.meta,
            type: 'quick_summary',
            signalCount: signals.reduce((acc: number, s: any) => acc + (s.items?.length || 0), 0),
            sources: ['news', 'funding', 'social']
          }
        };

        const report = await storage.createReport(reportData);
        reportId = report.id;
        createdAtISO = report.createdAt ? new Date(report.createdAt).toISOString() : undefined;
      }

      res.json({
        id: reportId,
        title: `Quick Summary (Tracked) — ${new Date().toLocaleDateString()}`,
        summary: compactPayload,
        createdAt: createdAtISO || new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating quick summary:", error);
      res.status(500).json({ message: "Failed to generate quick summary" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}