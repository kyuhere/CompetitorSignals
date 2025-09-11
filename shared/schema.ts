import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  plan: varchar("plan", { length: 20 }).default("free").notNull(), // 'free' or 'premium'
  dailyQueryCount: integer("daily_query_count").default(0),
  lastQueryDate: timestamp("last_query_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const competitorReports = pgTable("competitor_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  competitors: jsonb("competitors").notNull(), // Array of competitor names
  signals: jsonb("signals").notNull(), // Raw signal data
  summary: text("summary").notNull(), // AI-generated summary
  metadata: jsonb("metadata").notNull(), // Additional metadata like sources count, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).unique(),
  sessionId: varchar("session_id").unique(), // For guest users
  queryCount: integer("query_count").default(0),
  lastReset: timestamp("last_reset").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const insertCompetitorReportSchema = createInsertSchema(competitorReports).omit({
  id: true,
  createdAt: true,
});

export type InsertCompetitorReport = z.infer<typeof insertCompetitorReportSchema>;
export type CompetitorReport = typeof competitorReports.$inferSelect;

export const insertRateLimitSchema = createInsertSchema(rateLimits).omit({
  id: true,
  createdAt: true,
});

export type InsertRateLimit = z.infer<typeof insertRateLimitSchema>;
export type RateLimit = typeof rateLimits.$inferSelect;

// Tracked competitors table - stores competitors that users want to monitor
export const trackedCompetitors = pgTable("tracked_competitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  competitorName: varchar("competitor_name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true),
  addedAt: timestamp("added_at").defaultNow(),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
});


export const insertTrackedCompetitorSchema = createInsertSchema(trackedCompetitors).omit({
  id: true,
  addedAt: true,
});

export type InsertTrackedCompetitor = z.infer<typeof insertTrackedCompetitorSchema>;
export type TrackedCompetitor = typeof trackedCompetitors.$inferSelect;
