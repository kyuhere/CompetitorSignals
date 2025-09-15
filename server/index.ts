import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cron from 'node-cron';
import { storage } from './storage';
import { signalAggregator } from './services/signalAggregator';
import { summarizeNewsletterDigest } from './services/openai';
import { sendCompetitorReport } from './email';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("Error occurred:", err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  // In-process Scheduler (node-cron)
  const TZ = process.env.CRON_TZ || 'Europe/London';
  const defaultCron = app.get('env') === 'development' ? '*/10 * * * *' : '0 9 1,15 * *';
  const NEWSLETTER_CRON = process.env.NEWSLETTER_CRON || defaultCron;
  const TEST_EMAIL = (process.env.NEWSLETTER_TEST_EMAIL || '').toLowerCase();
  const FORCE = String(process.env.NEWSLETTER_FORCE || '').toLowerCase() === 'true';

  const toCanon = (v: string) => (v || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const trim = (arr?: string[]) => (Array.isArray(arr) ? arr.filter(Boolean).slice(0, 4) : undefined);

  async function runNewsletterForUser(user: { id: string; email?: string | null }) {
    const tracked = await storage.getUserTrackedCompetitors(user.id);
    if (!tracked || tracked.length === 0) return { skipped: 'no_tracked_competitors' };

    const competitorList = tracked.map(t => t.competitorName);
    const canonicalCompetitors = competitorList.map(toCanon).sort();
    const canonicalKey = `tracked_qs:${canonicalCompetitors.join('|')}`;

    if (!FORCE) {
      const recent = await storage.getUserReports(user.id, 5);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentNewsletter = recent.find(r => {
        const createdMs = r.createdAt ? new Date(r.createdAt as any).getTime() : 0;
        return (r.metadata as any)?.type === 'newsletter_summary' && createdMs >= twoHoursAgo;
      });
      if (recentNewsletter) return { skipped: 'recent_newsletter_exists' };
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

    if (user.email) {
      await sendCompetitorReport({
        to: user.email,
        reportTitle: persisted.title,
        reportContent: md,
        competitors: competitorList,
      });
    }
    return { reportId: persisted.id };
  }

  cron.schedule(NEWSLETTER_CRON, async () => {
    try {
      console.log(`[Scheduler] Running newsletter job: ${NEWSLETTER_CRON} TZ=${TZ}`);
      const candidates: Array<{ id: string; email?: string | null }>= [];
      if (TEST_EMAIL) {
        const u = await storage.getUserByEmail(TEST_EMAIL);
        if (u) candidates.push(u);
      } else {
        const premiumUsers = await storage.getPremiumUsers();
        candidates.push(...premiumUsers);
      }
      for (const user of candidates) {
        try {
          const res = await runNewsletterForUser(user);
          console.log(`[Scheduler] user=${user.id} email=${user.email || 'n/a'} ->`, res);
        } catch (err) {
          console.error('[Scheduler] Error for user', user.id, err);
        }
      }
    } catch (e) {
      console.error('[Scheduler] Fatal error', e);
    }
  }, { timezone: TZ });
  console.log(`[Scheduler] Registered newsletter cron: "${NEWSLETTER_CRON}" (TZ=${TZ})`);
})();
