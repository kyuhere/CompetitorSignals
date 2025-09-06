import {
  users,
  competitorReports,
  rateLimits,
  trackedCompetitors,
  type User,
  type UpsertUser,
  type CompetitorReport,
  type InsertCompetitorReport,
  type RateLimit,
  type InsertRateLimit,
  type TrackedCompetitor,
  type InsertTrackedCompetitor,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Competitor report operations
  createReport(report: InsertCompetitorReport): Promise<CompetitorReport>;
  getReport(id: string): Promise<CompetitorReport | undefined>;
  getReportById(id: string): Promise<CompetitorReport | undefined>;
  getUserReports(userId: string, limit?: number): Promise<CompetitorReport[]>;
  
  // Rate limiting operations
  getRateLimit(userId?: string, sessionId?: string): Promise<RateLimit | undefined>;
  upsertRateLimit(rateLimit: InsertRateLimit): Promise<RateLimit>;
  resetDailyLimits(): Promise<void>;
  
  // Tracked competitors operations
  addTrackedCompetitor(competitor: InsertTrackedCompetitor): Promise<TrackedCompetitor>;
  getUserTrackedCompetitors(userId: string): Promise<TrackedCompetitor[]>;
  removeTrackedCompetitor(userId: string, competitorId: string): Promise<void>;
  getTrackedCompetitorCount(userId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Competitor report operations
  async createReport(report: InsertCompetitorReport): Promise<CompetitorReport> {
    const [newReport] = await db
      .insert(competitorReports)
      .values(report)
      .returning();
    return newReport;
  }

  async getReport(id: string): Promise<CompetitorReport | undefined> {
    const [report] = await db
      .select()
      .from(competitorReports)
      .where(eq(competitorReports.id, id));
    return report;
  }

  async getReportById(id: string): Promise<CompetitorReport | undefined> {
    return this.getReport(id);
  }

  async getUserReports(userId: string, limit = 10): Promise<CompetitorReport[]> {
    return await db
      .select()
      .from(competitorReports)
      .where(eq(competitorReports.userId, userId))
      .orderBy(desc(competitorReports.createdAt))
      .limit(limit);
  }

  // Rate limiting operations
  async getRateLimit(userId?: string, sessionId?: string): Promise<RateLimit | undefined> {
    if (userId) {
      const [rateLimit] = await db
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.userId, userId));
      return rateLimit;
    } else if (sessionId) {
      const [rateLimit] = await db
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.sessionId, sessionId));
      return rateLimit;
    }
    return undefined;
  }

  async upsertRateLimit(rateLimitData: InsertRateLimit): Promise<RateLimit> {
    if (rateLimitData.userId) {
      const [rateLimit] = await db
        .insert(rateLimits)
        .values(rateLimitData)
        .onConflictDoUpdate({
          target: rateLimits.userId,
          set: {
            queryCount: rateLimitData.queryCount,
            lastReset: rateLimitData.lastReset,
          },
        })
        .returning();
      return rateLimit;
    } else if (rateLimitData.sessionId) {
      const [rateLimit] = await db
        .insert(rateLimits)
        .values(rateLimitData)
        .onConflictDoUpdate({
          target: rateLimits.sessionId,
          set: {
            queryCount: rateLimitData.queryCount,
            lastReset: rateLimitData.lastReset,
          },
        })
        .returning();
      return rateLimit;
    } else {
      throw new Error("Either userId or sessionId must be provided");
    }
  }

  async resetDailyLimits(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await db
      .update(rateLimits)
      .set({ 
        queryCount: 0,
        lastReset: new Date(),
      })
      .where(sql`last_reset < ${yesterday}`);
  }

  // Tracked competitors operations
  async addTrackedCompetitor(competitor: InsertTrackedCompetitor): Promise<TrackedCompetitor> {
    const [newCompetitor] = await db
      .insert(trackedCompetitors)
      .values(competitor)
      .returning();
    return newCompetitor;
  }

  async getUserTrackedCompetitors(userId: string): Promise<TrackedCompetitor[]> {
    return await db
      .select()
      .from(trackedCompetitors)
      .where(and(
        eq(trackedCompetitors.userId, userId),
        eq(trackedCompetitors.isActive, true)
      ))
      .orderBy(desc(trackedCompetitors.addedAt));
  }

  async removeTrackedCompetitor(userId: string, competitorId: string): Promise<void> {
    await db
      .update(trackedCompetitors)
      .set({ isActive: false })
      .where(and(
        eq(trackedCompetitors.userId, userId),
        eq(trackedCompetitors.id, competitorId)
      ));
  }

  async getTrackedCompetitorCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackedCompetitors)
      .where(and(
        eq(trackedCompetitors.userId, userId),
        eq(trackedCompetitors.isActive, true)
      ));
    return result[0]?.count || 0;
  }
}

export const storage = new DatabaseStorage();
