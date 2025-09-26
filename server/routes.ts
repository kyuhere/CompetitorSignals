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

import { summarizeCompetitorSignals, generateFastPreview, summarizeCompactSignals, summarizeNewsletterDigest } from "./services/openai";
import { openaiWebSearch } from "./services/openaiWebSearch";
import { trustpilotService } from "./services/trustpilot";
import { sendCompetitorReport } from "./email";

// Store active streaming sessions
const streamingSessions = new Map<string, any>();

// --- Enhanced SWR cache & streaming ---
type EnhancedCacheItem = {
  payload: any; // enhanced array shape
  lastUpdated: number; // epoch ms
  expires: number; // epoch ms
};
const ENHANCED_TTL_MS = 10 * 60 * 1000; // 10 minutes
const enhancedCacheByReport = new Map<string, EnhancedCacheItem>();
const enhancedStreamSubscribers = new Map<string, Set<any>>(); // reportId -> Set<Response>

function pushEnhancedUpdate(reportId: string, payload: any) {
  const subs = enhancedStreamSubscribers.get(reportId);
  if (!subs || subs.size === 0) return;
  const data = JSON.stringify({ type: 'enhanced_update', payload });
  subs.forEach((res) => {
    try { res.write(`data: ${data}\n\n`); } catch {}
  });
}

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
  // Latest News (OpenAI web_search): curated recent unique articles by report competitors
  app.get('/api/reports/:id/news', async (req: any, res) => {
    try {
      const { id } = req.params;
      const report = await storage.getReportById(id);
      if (!report) return res.status(404).json({ message: 'Report not found' });

      const competitors: string[] = Array.isArray(report.competitors) ? report.competitors : [];
      if (competitors.length === 0) return res.json([]);

      // Fetch in parallel via OpenAI web_search (force use regardless of flag for this endpoint)
      const per = await Promise.allSettled(
        competitors.map(c => openaiWebSearch.searchNewsForCompetitor(String(c), 'general'))
      );
      const all = per.flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Deduplicate by URL and title
      const seen = new Set<string>();
      const items = [] as Array<{ title: string; url: string; domain: string; publishedAt?: string; competitor?: string }>;
      for (const it of all) {
        const url = (it as any)?.url || '';
        const title = (it as any)?.title || '';
        if (!url || !title) continue;
        try {
          const key = `${new URL(url).href}|${title.trim().toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const publishedAt = (it as any)?.publishedAt;
          if (publishedAt) {
            const d = new Date(publishedAt);
            if (!isNaN(d.getTime()) && d < thirtyDaysAgo) continue;
          }
          const domain = new URL(url).hostname.replace(/^www\./, '');
          items.push({ title, url, domain, publishedAt, competitor: (it as any)?.competitor });
        } catch {}
      }

      // Sort by date desc when available, else keep order
      items.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
      res.json(items.slice(0, 12));
    } catch (err) {
      console.error('[Routes] /api/news failed', err);
      res.status(500).json({ message: 'Failed to fetch latest news' });
    }
  });

  // Helper: trigger background refresh of enhanced data for a report
  async function refreshEnhancedForReport(reportId: string, report: any) {
    try {
      const competitors: string[] = Array.isArray(report.competitors) ? report.competitors : [];
      const sources = (report.metadata?.sources || []).reduce((acc: any, k: string) => { acc[k] = true; return acc; }, { news: true, funding: true, social: true, products: false });
      const mode: 'free' | 'premium' = (report.metadata?.enhanced?.locked === false) ? 'premium' : 'free';

      const enhancedResults = await enhancedSignalAggregator.aggregateEnhancedSignals(
        competitors,
        [],
        sources,
        undefined,
        { mode, computeSentiment: mode === 'premium' }
      );

      const enhancedData = enhancedResults.enhanced || [];
      const cacheItem: EnhancedCacheItem = {
        payload: enhancedData,
        lastUpdated: Date.now(),
        expires: Date.now() + ENHANCED_TTL_MS,
      };
      enhancedCacheByReport.set(reportId, cacheItem);
      pushEnhancedUpdate(reportId, enhancedData);
    } catch (err) {
      console.error('[Enhanced] Refresh failed for report', reportId, err);
    }
  }

  // SWR: get enhanced data (instant cached + background refresh)
  app.get('/api/reports/:id/enhanced', async (req: any, res) => {
    try {
      const { id } = req.params;
      const report = await storage.getReportById(id);
      if (!report) return res.status(404).json({ message: 'Report not found' });

      // Seed from report metadata if cache empty
      let cacheItem = enhancedCacheByReport.get(id);
      if (!cacheItem) {
        const seeded = (report as any).metadata?.enhanced?.reviewData;
        if (seeded) {
          cacheItem = {
            payload: seeded,
            lastUpdated: Date.now(),
            expires: Date.now() + ENHANCED_TTL_MS,
          };
          enhancedCacheByReport.set(id, cacheItem);
        }
      }

      const stale = !cacheItem || cacheItem.expires <= Date.now();
      res.setHeader('X-Data-Stale', String(stale));
      if (cacheItem) {
        res.setHeader('X-Last-Updated', new Date(cacheItem.lastUpdated).toISOString());
        res.json(cacheItem.payload);
      } else {
        res.json([]);
      }

      // Trigger background refresh if stale
      if (stale) {
        refreshEnhancedForReport(id, report);
      }
    } catch (err) {
      console.error('[Enhanced] get enhanced failed', err);
      res.status(500).json({ message: 'Failed to fetch enhanced data' });
    }
  });

  // SWR: SSE stream for enhanced updates
  app.get('/api/reports/:id/enhanced/stream', async (req: any, res) => {
    try {
      const { id } = req.params;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // register subscriber
      if (!enhancedStreamSubscribers.has(id)) enhancedStreamSubscribers.set(id, new Set());
      const set = enhancedStreamSubscribers.get(id)!;
      set.add(res);

      // send initial keepalive
      res.write('data: {"type":"keepalive"}\n\n');

      req.on('close', () => {
        try { set.delete(res); } catch {}
      });
    } catch (err) {
      console.error('[Enhanced] stream failed', err);
      res.status(500).end();
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

      let reusableReport: any = null;
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

      // Disable reuse to avoid stale or unrelated competitors in quick summaries
      reusableReport = null;
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
        
        // Normalize and filter snippets to only tracked competitors; dedupe by canonical
        try {
          const trackedCanonToName = new Map<string, string>();
          for (const name of competitorList) {
            trackedCanonToName.set(toCanonical(name), name);
          }

          const seenCanon = new Set<string>();
          compactPayload.competitorSnippets = (compactPayload.competitorSnippets || [])
            .map((s: any) => ({ canon: toCanonical(s.competitor || ''), bullets: (s.bullets || []).filter(Boolean) }))
            .filter((s: any) => trackedCanonToName.has(s.canon))
            .filter((s: any) => {
              if (seenCanon.has(s.canon)) return false;
              seenCanon.add(s.canon);
              return true;
            })
            .map((s: any) => ({ competitor: trackedCanonToName.get(s.canon)!, bullets: s.bullets }));
        } catch {}

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

        // Enrich fallback-only snippets with last-known insights from the reusable report
        try {
          const canonToRecentBullet = new Map<string, string>();
          const fromFast = (existingSummary.competitorSnippets || existingSummary.competitor_insights || []) as any[];
          for (const ins of fromFast) {
            const canon = toCanonical(ins.competitor || '');
            const bullet = ins.key_update || (Array.isArray(ins.bullets) ? ins.bullets[0] : undefined);
            if (canon && bullet && !canonToRecentBullet.has(canon)) canonToRecentBullet.set(canon, bullet);
          }
          const fromFull = (existingSummary.competitors || []) as any[];
          for (const comp of fromFull) {
            const canon = toCanonical(comp.competitor || '');
            const bullet = Array.isArray(comp.recent_developments) ? comp.recent_developments[0] : undefined;
            if (canon && bullet && !canonToRecentBullet.has(canon)) canonToRecentBullet.set(canon, bullet);
          }
          for (const snip of compactPayload.competitorSnippets) {
            const canon = toCanonical(snip.competitor || '');
            const hasOnlyFallback = !snip.bullets || snip.bullets.length === 0 || snip.bullets.every((b: string) => /No major updates|Monitoring for new signals/i.test(b));
            if (hasOnlyFallback) {
              const lastKnown = canonToRecentBullet.get(canon);
              if (lastKnown) snip.bullets = [lastKnown, ...(snip.bullets || [])].slice(0, 3);
            }
          }
        } catch {}

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
        // Newsletter mode: fast, email-ready Markdown summary
        const mode = ((req.query?.mode || req.body?.mode) || '').toString();
        if (mode === 'newsletter') {
          console.log('[QuickSummary] Newsletter mode activated');
          const sources = { news: true, funding: true, social: false, products: true };
          const signals = await signalAggregator.aggregateSignals(
            competitorList,
            [],
            sources
          );

          const toCanon = (v: string) => (v || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const trackedCompanies = competitorList.map((name: string) => ({ canonicalName: name }));

          // Fresh buckets
          const fresh: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
          for (const g of signals) {
            const canon = toCanon(g.competitor || '');
            const display = competitorList.find(c => toCanon(c) === canon);
            if (!display) continue;
            for (const it of (g.items || [])) {
              const line = it.title || it.content || '';
              if (!line) continue;
              if (it.type === 'news') {
                fresh[display] = fresh[display] || {}; 
                fresh[display].developments = [ ...(fresh[display].developments || []), line ];
              } else if (it.type === 'funding') {
                fresh[display] = fresh[display] || {}; 
                fresh[display].funding = [ ...(fresh[display].funding || []), line ];
              } else if (it.type === 'product') {
                fresh[display] = fresh[display] || {}; 
                fresh[display].tech = [ ...(fresh[display].tech || []), line ];
              }
            }
          }

          // History from recent reports
          const recentReports = await storage.getUserReports(userId, 25);
          const history: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
          for (const rep of recentReports) {
            if (!rep?.summary) continue;
            let sum: any = rep.summary;
            try { sum = typeof rep.summary === 'string' ? JSON.parse(rep.summary) : rep.summary; } catch {}

            const fast = (sum && (sum.competitorSnippets || sum.competitor_insights)) || [];
            for (const ins of fast) {
              const canon = toCanon(ins.competitor || '');
              const display = competitorList.find(c => toCanon(c) === canon);
              if (!display) continue;
              const bullet = ins.key_update || (Array.isArray(ins.bullets) ? ins.bullets[0] : undefined);
              if (!bullet) continue;
              history[display] = history[display] || {};
              history[display].developments = [ ...(history[display].developments || []), bullet ];
            }

            const comps = (sum && sum.competitors) || [];
            for (const c of comps) {
              const canon = toCanon(c.competitor || '');
              const display = competitorList.find(n => toCanon(n) === canon);
              if (!display) continue;
              history[display] = history[display] || {};
              if (Array.isArray(c.recent_developments)) history[display].developments = [ ...(history[display].developments || []), ...c.recent_developments ];
              if (Array.isArray(c.funding_business)) history[display].funding = [ ...(history[display].funding || []), ...c.funding_business ];
              if (c.market_presence?.target_audience || c.target_market?.primary_segments) {
                const m = [c.market_presence?.target_audience, c.target_market?.primary_segments].filter(Boolean).join(' — ');
                if (m) history[display].market = [ ...(history[display].market || []), m ];
              }
              if (c.tech_assessment?.tech_stack || c.tech_innovation?.differentiating_innovations) {
                const t = [c.tech_assessment?.tech_stack, c.tech_innovation?.differentiating_innovations].filter(Boolean).join(' — ');
                if (t) history[display].tech = [ ...(history[display].tech || []), t ];
              }
            }
          }

          const trim = (arr?: string[]) => (Array.isArray(arr) ? arr.filter(Boolean).slice(0, 4) : undefined);
          for (const k of Object.keys(fresh)) {
            fresh[k].developments = trim(fresh[k].developments);
            fresh[k].funding = trim(fresh[k].funding);
            fresh[k].market = trim(fresh[k].market);
            fresh[k].tech = trim(fresh[k].tech);
          }
          for (const k of Object.keys(history)) {
            history[k].developments = trim(history[k].developments);
            history[k].funding = trim(history[k].funding);
            history[k].market = trim(history[k].market);
            history[k].tech = trim(history[k].tech);
          }

          // Ensure each tracked company will appear at least once in the digest
          for (const name of competitorList) {
            const f = fresh[name] || {};
            const h = history[name] || {};
            const hasAny = [f.developments, f.funding, f.market, f.tech, h.developments, h.funding, h.market, h.tech]
              .some(arr => Array.isArray(arr) && arr.length > 0);
            if (!hasAny) {
              fresh[name] = { ...(fresh[name] || {}), developments: ["No major updates in this period; monitoring for changes"] };
            }
          }

          const fromISO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const toISO = new Date().toISOString();
          const md = await summarizeNewsletterDigest({
            trackedCompanies,
            history,
            fresh,
            period: { from: fromISO, to: toISO }
          });

          const persisted = await storage.createReport({
            userId,
            title: `Quick Summary (Newsletter) — ${new Date().toLocaleDateString()}`,
            competitors: competitorList,
            signals: [],
            summary: md,
            metadata: {
              generatedAt: new Date().toISOString(),
              competitorCount: competitorList.length,
              canonicalKey,
              type: 'newsletter_summary',
              sources: ['news', 'funding', 'products']
            }
          });
          reportId = persisted.id;
          createdAtISO = persisted.createdAt ? new Date(persisted.createdAt).toISOString() : undefined;

          return res.json({ id: reportId, title: persisted.title, summary: md, createdAt: createdAtISO || new Date().toISOString() });
        }

        // Generate fresh compact full-structure analysis (fast, tab-friendly)
        const sources = {
          news: true,
          funding: true,
          social: true,
          products: false
        };

        // Aggregate signals (lightweight)
        const signals = await signalAggregator.aggregateSignals(
          competitorList,
          [], // No custom URLs
          sources
        );
        // Filter signals strictly to tracked competitors and map names
        const trackedCanonToName = new Map<string, string>();
        for (const name of competitorList) trackedCanonToName.set(toCanonical(name), name);
        const filteredSignals = signals
          .map((g: any) => ({
            ...g,
            _canon: toCanonical(g.competitor || ''),
          }))
          .filter((g: any) => trackedCanonToName.has(g._canon))
          .map((g: any) => ({
            source: g.source,
            competitor: trackedCanonToName.get(g._canon)!,
            items: (g.items || []).slice(0, 4)
          }));

        // Generate compact full-structure analysis
        const compactJson = await summarizeCompactSignals(filteredSignals, competitorList);
        const parsedCompact = JSON.parse(compactJson);

        // Normalize competitor names to tracked labels and filter out any extraneous competitors
        try {
          parsedCompact.competitors = (parsedCompact.competitors || [])
            .map((c: any) => ({ ...c, _canon: toCanonical(c.competitor || '') }))
            .filter((c: any) => trackedCanonToName.has(c._canon))
            .map((c: any) => {
              const mappedName = trackedCanonToName.get(c._canon)!;
              c.competitor = mappedName;
              return c;
            });

          // Defensive truncation to keep it snappy
          for (const c of parsedCompact.competitors) {
            if (Array.isArray(c.company_overview?.key_products_services)) c.company_overview.key_products_services = c.company_overview.key_products_services.slice(0, 3);
            if (Array.isArray(c.strengths_weaknesses?.strengths)) c.strengths_weaknesses.strengths = c.strengths_weaknesses.strengths.slice(0, 3);
            if (Array.isArray(c.strengths_weaknesses?.weaknesses)) c.strengths_weaknesses.weaknesses = c.strengths_weaknesses.weaknesses.slice(0, 3);
            if (Array.isArray(c.products_services?.main_offerings)) c.products_services.main_offerings = c.products_services.main_offerings.slice(0, 3);
            if (Array.isArray(c.products_services?.unique_selling_points)) c.products_services.unique_selling_points = c.products_services.unique_selling_points.slice(0, 3);
            if (Array.isArray(c.swot_analysis?.strengths)) c.swot_analysis.strengths = c.swot_analysis.strengths.slice(0, 3);
            if (Array.isArray(c.swot_analysis?.weaknesses)) c.swot_analysis.weaknesses = c.swot_analysis.weaknesses.slice(0, 3);
            if (Array.isArray(c.swot_analysis?.opportunities)) c.swot_analysis.opportunities = c.swot_analysis.opportunities.slice(0, 3);
            if (Array.isArray(c.swot_analysis?.threats)) c.swot_analysis.threats = c.swot_analysis.threats.slice(0, 3);
            if (Array.isArray(c.recent_developments)) c.recent_developments = c.recent_developments.slice(0, 3);
            if (Array.isArray(c.funding_business)) c.funding_business = c.funding_business.slice(0, 3);
          }
          if (Array.isArray(parsedCompact.strategic_insights)) parsedCompact.strategic_insights = parsedCompact.strategic_insights.slice(0, 5);
        } catch {}

        // Persist as new report (compact full)
        const reportData = {
          userId,
          title: `Quick Summary (Tracked) — ${new Date().toLocaleDateString()}`,
          competitors: competitorList,
          signals: filteredSignals,
          summary: typeof parsedCompact === 'string' ? parsedCompact : JSON.stringify(parsedCompact),
          metadata: {
            generatedAt: new Date().toISOString(),
            competitorCount: competitorList.length,
            canonicalKey,
            reused: false,
            type: 'compact_full',
            signalCount: filteredSignals.reduce((acc: number, s: any) => acc + (s.items?.length || 0), 0),
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

  // Automation: Generate and email newsletter quick summaries for premium users (token-protected)
  app.post('/api/automation/quick-summary/send', async (req: any, res) => {
    try {
      const headerToken = req.header('x-automation-token') || '';
      const queryToken = (req.query?.token || '').toString();
      const token = headerToken || queryToken;
      if (!process.env.AUTOMATION_TOKEN || token !== process.env.AUTOMATION_TOKEN) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const onlyUserEmail = (req.body?.onlyUserEmail || req.query?.onlyUserEmail || '').toString().trim().toLowerCase();
      const force = Boolean(req.body?.force || req.query?.force);

      let candidates: Array<{ id: string; email?: string | null }> = [];
      if (onlyUserEmail) {
        const u = await storage.getUserByEmail(onlyUserEmail);
        if (u && u.email) {
          candidates = [u];
        } else {
          return res.json({ ok: false, sent: 0, results: [{ email: onlyUserEmail, error: 'user_not_found_or_no_email' }] });
        }
      } else {
        const premiumUsers = await storage.getPremiumUsers();
        candidates = premiumUsers.filter(u => !!u.email);
      }

      const toCanon = (v: string) => (v || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const results: Array<{ userId: string; email: string; reportId?: string; skipped?: string; error?: string }> = [];

      for (const user of candidates) {
        try {
          const tracked = await storage.getUserTrackedCompetitors(user.id);
          if (!tracked || tracked.length === 0) {
            results.push({ userId: user.id, email: user.email!, skipped: 'no_tracked_competitors' });
            continue;
          }

          const competitorList = tracked.map(t => t.competitorName);
          const canonicalCompetitors = competitorList.map(toCanon).sort();
          const canonicalKey = `tracked_qs:${canonicalCompetitors.join('|')}`;

          if (!force) {
            const recent = await storage.getUserReports(user.id, 5);
            const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
            const recentNewsletter = recent.find(r => (r.metadata as any)?.type === 'newsletter_summary' && (r.createdAt ? new Date(r.createdAt as any).getTime() : 0) >= twoHoursAgo);
            if (recentNewsletter) {
              results.push({ userId: user.id, email: user.email!, skipped: 'recent_newsletter_exists' });
              continue;
            }
          }

          const sources = { news: true, funding: true, social: false, products: true };
          const signals = await signalAggregator.aggregateSignals(competitorList, [], sources);

          const fresh: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
          for (const g of signals) {
            const canon = toCanon(g.competitor || '');
            const display = competitorList.find(c => toCanon(c) === canon);
            if (!display) continue;
            for (const it of (g.items || [])) {
              const line = it.title || it.content || '';
              if (!line) continue;
              if (it.type === 'news') {
                fresh[display] = fresh[display] || {};
                fresh[display].developments = [ ...(fresh[display].developments || []), line ];
              } else if (it.type === 'funding') {
                fresh[display] = fresh[display] || {};
                fresh[display].funding = [ ...(fresh[display].funding || []), line ];
              } else if (it.type === 'product') {
                fresh[display] = fresh[display] || {};
                fresh[display].tech = [ ...(fresh[display].tech || []), line ];
              }
            }
          }

          const recentReports = await storage.getUserReports(user.id, 25);
          const history: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
          for (const rep of recentReports) {
            if (!rep?.summary) continue;
            let sum: any = rep.summary;
            try { sum = typeof rep.summary === 'string' ? JSON.parse(rep.summary) : rep.summary; } catch {}

            const fast = (sum && (sum.competitorSnippets || sum.competitor_insights)) || [];
            for (const ins of fast) {
              const canon = toCanon(ins.competitor || '');
              const display = competitorList.find(c => toCanon(c) === canon);
              if (!display) continue;
              const bullet = ins.key_update || (Array.isArray(ins.bullets) ? ins.bullets[0] : undefined);
              if (!bullet) continue;
              history[display] = history[display] || {};
              history[display].developments = [ ...(history[display].developments || []), bullet ];
            }

            const comps = (sum && sum.competitors) || [];
            for (const c of comps) {
              const canon = toCanon(c.competitor || '');
              const display = competitorList.find(n => toCanon(n) === canon);
              if (!display) continue;
              history[display] = history[display] || {};
              if (Array.isArray(c.recent_developments)) history[display].developments = [ ...(history[display].developments || []), ...c.recent_developments ];
              if (Array.isArray(c.funding_business)) history[display].funding = [ ...(history[display].funding || []), ...c.funding_business ];
              if (c.market_presence?.target_audience || c.target_market?.primary_segments) {
                const m = [c.market_presence?.target_audience, c.target_market?.primary_segments].filter(Boolean).join(' — ');
                if (m) history[display].market = [ ...(history[display].market || []), m ];
              }
              if (c.tech_assessment?.tech_stack || c.tech_innovation?.differentiating_innovations) {
                const t = [c.tech_assessment?.tech_stack, c.tech_innovation?.differentiating_innovations].filter(Boolean).join(' — ');
                if (t) history[display].tech = [ ...(history[display].tech || []), t ];
              }
            }
          }

          const trim = (arr?: string[]) => (Array.isArray(arr) ? arr.filter(Boolean).slice(0, 4) : undefined);
          for (const k of Object.keys(fresh)) {
            fresh[k].developments = trim(fresh[k].developments);
            fresh[k].funding = trim(fresh[k].funding);
            fresh[k].market = trim(fresh[k].market);
            fresh[k].tech = trim(fresh[k].tech);
          }
          for (const k of Object.keys(history)) {
            history[k].developments = trim(history[k].developments);
            history[k].funding = trim(history[k].funding);
            history[k].market = trim(history[k].market);
            history[k].tech = trim(history[k].tech);
          }

          for (const name of competitorList) {
            const f = fresh[name] || {};
            const h = history[name] || {};
            const hasAny = [f.developments, f.funding, f.market, f.tech, h.developments, h.funding, h.market, h.tech]
              .some(arr => Array.isArray(arr) && arr.length > 0);
            if (!hasAny) {
              fresh[name] = { ...(fresh[name] || {}), developments: ["No major updates in this period; monitoring for changes"] };
            }
          }

          const fromISO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const toISO = new Date().toISOString();
          const md = await summarizeNewsletterDigest({
            trackedCompanies: competitorList.map((name: string) => ({ canonicalName: name })),
            history,
            fresh,
            period: { from: fromISO, to: toISO }
          });

          const persisted = await storage.createReport({
            userId: user.id,
            title: `Quick Summary (Newsletter) — ${new Date().toLocaleDateString()}`,
            competitors: competitorList,
            signals: [],
            summary: md,
            metadata: {
              generatedAt: new Date().toISOString(),
              competitorCount: competitorList.length,
              canonicalKey,
              type: 'newsletter_summary',
              sources: ['news', 'funding', 'products']
            }
          });

          await sendCompetitorReport({
            to: user.email!,
            reportTitle: persisted.title,
            reportContent: md,
            competitors: competitorList,
          });

          results.push({ userId: user.id, email: user.email!, reportId: persisted.id });
        } catch (err: any) {
          console.error('Automation error for user', user.id, err);
          results.push({ userId: user.id, email: user.email!, error: err?.message || 'unknown' });
        }
      }

      res.json({ ok: true, sent: results.filter(r => r.reportId).length, results });
    } catch (error: any) {
      console.error('Automation endpoint failure:', error);
      res.status(500).json({ message: error?.message || 'Internal error' });
    }
  });

  // Automation (self): Authenticated premium user triggers their own newsletter send
  app.post('/api/automation/quick-summary/send/me', async (req: any, res) => {
    try {
      const auth = await getAuthContext(req);
      if (!auth.isAuthenticated || !auth.userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const user = await storage.getUser(auth.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const plan = getEffectivePlan(user, req);
      if (plan !== 'premium') {
        return res.status(403).json({ message: 'Premium plan required' });
      }

      const force = Boolean(req.body?.force || req.query?.force);
      const tracked = await storage.getUserTrackedCompetitors(user.id);
      if (!tracked || tracked.length === 0) {
        return res.status(400).json({ message: 'No tracked competitors to summarize' });
      }

      const competitorList = tracked.map(t => t.competitorName);
      const toCanon = (v: string) => (v || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const canonicalCompetitors = competitorList.map(toCanon).sort();
      const canonicalKey = `tracked_qs:${canonicalCompetitors.join('|')}`;

      if (!force) {
        const recent = await storage.getUserReports(user.id, 5);
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const recentNewsletter = recent.find(r => (r.metadata as any)?.type === 'newsletter_summary' && (r.createdAt ? new Date(r.createdAt as any).getTime() : 0) >= twoHoursAgo);
        if (recentNewsletter) {
          return res.json({ ok: true, skipped: 'recent_newsletter_exists' });
        }
      }

      const sources = { news: true, funding: true, social: false, products: true };
      const signals = await signalAggregator.aggregateSignals(competitorList, [], sources);

      const fresh: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
      for (const g of signals) {
        const canon = toCanon(g.competitor || '');
        const display = competitorList.find(c => toCanon(c) === canon);
        if (!display) continue;
        for (const it of (g.items || [])) {
          const line = it.title || it.content || '';
          if (!line) continue;
          if (it.type === 'news') {
            fresh[display] = fresh[display] || {}; 
            fresh[display].developments = [ ...(fresh[display].developments || []), line ];
          } else if (it.type === 'funding') {
            fresh[display] = fresh[display] || {}; 
            fresh[display].funding = [ ...(fresh[display].funding || []), line ];
          } else if (it.type === 'product') {
            fresh[display] = fresh[display] || {}; 
            fresh[display].tech = [ ...(fresh[display].tech || []), line ];
          }
        }
      }

      const recentReports = await storage.getUserReports(user.id, 25);
      const history: Record<string, { developments?: string[]; funding?: string[]; market?: string[]; tech?: string[] }> = {};
      for (const rep of recentReports) {
        if (!rep?.summary) continue;
        let sum: any = rep.summary;
        try { sum = typeof rep.summary === 'string' ? JSON.parse(rep.summary) : rep.summary; } catch {}

        const fast = (sum && (sum.competitorSnippets || sum.competitor_insights)) || [];
        for (const ins of fast) {
          const canon = toCanon(ins.competitor || '');
          const display = competitorList.find(c => toCanon(c) === canon);
          if (!display) continue;
          const bullet = ins.key_update || (Array.isArray(ins.bullets) ? ins.bullets[0] : undefined);
          if (!bullet) continue;
          history[display] = history[display] || {};
          history[display].developments = [ ...(history[display].developments || []), bullet ];
        }

        const comps = (sum && sum.competitors) || [];
        for (const c of comps) {
          const canon = toCanon(c.competitor || '');
          const display = competitorList.find(n => toCanon(n) === canon);
          if (!display) continue;
          history[display] = history[display] || {};
          if (Array.isArray(c.recent_developments)) history[display].developments = [ ...(history[display].developments || []), ...c.recent_developments ];
          if (Array.isArray(c.funding_business)) history[display].funding = [ ...(history[display].funding || []), ...c.funding_business ];
          if (c.market_presence?.target_audience || c.target_market?.primary_segments) {
            const m = [c.market_presence?.target_audience, c.target_market?.primary_segments].filter(Boolean).join(' — ');
            if (m) history[display].market = [ ...(history[display].market || []), m ];
          }
          if (c.tech_assessment?.tech_stack || c.tech_innovation?.differentiating_innovations) {
            const t = [c.tech_assessment?.tech_stack, c.tech_innovation?.differentiating_innovations].filter(Boolean).join(' — ');
            if (t) history[display].tech = [ ...(history[display].tech || []), t ];
          }
        }
      }

      const trim2 = (arr?: string[]) => (Array.isArray(arr) ? arr.filter(Boolean).slice(0, 4) : undefined);
      for (const k of Object.keys(fresh)) {
        fresh[k].developments = trim2(fresh[k].developments);
        fresh[k].funding = trim2(fresh[k].funding);
        fresh[k].market = trim2(fresh[k].market);
        fresh[k].tech = trim2(fresh[k].tech);
      }
      for (const k of Object.keys(history)) {
        history[k].developments = trim2(history[k].developments);
        history[k].funding = trim2(history[k].funding);
        history[k].market = trim2(history[k].market);
        history[k].tech = trim2(history[k].tech);
      }

      for (const name of competitorList) {
        const f = fresh[name] || {};
        const h = history[name] || {};
        const hasAny = [f.developments, f.funding, f.market, f.tech, h.developments, h.funding, h.market, h.tech]
          .some(arr => Array.isArray(arr) && arr.length > 0);
        if (!hasAny) {
          fresh[name] = { ...(fresh[name] || {}), developments: ["No major updates in this period; monitoring for changes"] };
        }
      }

      const fromISO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const toISO = new Date().toISOString();
      const md = await summarizeNewsletterDigest({
        trackedCompanies: competitorList.map((name: string) => ({ canonicalName: name })),
        history,
        fresh,
        period: { from: fromISO, to: toISO }
      });

      const persisted = await storage.createReport({
        userId: user.id,
        title: `Quick Summary (Newsletter) — ${new Date().toLocaleDateString()}`,
        competitors: competitorList,
        signals: [],
        summary: md,
        metadata: {
          generatedAt: new Date().toISOString(),
          competitorCount: competitorList.length,
          canonicalKey,
          type: 'newsletter_summary',
          sources: ['news', 'funding', 'products']
        }
      });

      if (!user.email) {
        return res.json({ ok: true, reportId: persisted.id, warning: 'user_has_no_email' });
      }

      await sendCompetitorReport({
        to: user.email,
        reportTitle: persisted.title,
        reportContent: md,
        competitors: competitorList,
      });

      res.json({ ok: true, reportId: persisted.id });
    } catch (error: any) {
      console.error('Automation self endpoint failure:', error);
      res.status(500).json({ message: error?.message || 'Internal error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}