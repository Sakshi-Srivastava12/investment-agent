import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface CompanyInfo {
  ticker?: string;
  sector?: string;
  exchange?: string;
  ceo?: string;
  headquarters?: string;
  founded?: string;
  industry?: string;
  marketCap?: string;
}

export interface StockData {
  price?: string;
  change?: string;
  changePercent?: string;
  high52w?: string;
  low52w?: string;
  volume?: string;
  pe?: string;
  eps?: string;
  dividend?: string;
  revenue?: string;
  netMargin?: string;
  roe?: string;
  debtEquity?: string;
  beta?: string;
}

export interface NewsItem {
  headline: string;
  url?: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface ScoreBreakdown {
  overall: number;
  financials: number;
  valuation: number;
  growth: number;
  risk: number;
  news: number;
  sentiment: number;
}

export interface ConfidenceBreakdown {
  financialData: number;
  newsQuality: number;
  analystConsensus: number;
  marketSentiment: number;
}

export interface ResearchDetails {
  companyInfo?: CompanyInfo;
  stockData?: StockData;
  news?: NewsItem[];
  bull?: string[];
  bear?: string[];
  scores?: ScoreBreakdown;
  confidenceBreakdown?: ConfidenceBreakdown;
}

export const researchJobs = pgTable("research_jobs", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  status: text("status").notNull().default("pending"),
  verdict: text("verdict"),
  summary: text("summary"),
  reasoning: jsonb("reasoning").$type<string[]>(),
  sources: jsonb("sources").$type<string[]>(),
  confidence: integer("confidence"),
  details: jsonb("details").$type<ResearchDetails>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertResearchJobSchema = createInsertSchema(researchJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertResearchJob = z.infer<typeof insertResearchJobSchema>;
export type ResearchJob = typeof researchJobs.$inferSelect;
