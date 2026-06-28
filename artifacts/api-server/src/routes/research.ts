import { Router } from "express";
import { db } from "@workspace/db";
import { researchJobs } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  StartResearchBody,
  GetResearchParams,
} from "@workspace/api-zod";
import { runInvestmentResearch } from "../lib/agent";
import { logger } from "../lib/logger";

const router = Router();

// GET /research/stats
router.get("/research/stats", async (_req, res) => {
  try {
    const rows = await db
      .select({
        total: sql<number>`count(*)::int`,
        invest: sql<number>`count(*) filter (where verdict = 'invest')::int`,
        pass: sql<number>`count(*) filter (where verdict = 'pass')::int`,
        pending: sql<number>`count(*) filter (where status in ('pending','running'))::int`,
        avgConfidence: sql<number | null>`avg(confidence)::float`,
      })
      .from(researchJobs);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "Error fetching stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /research — list recent jobs
router.get("/research", async (_req, res) => {
  try {
    const jobs = await db
      .select()
      .from(researchJobs)
      .orderBy(desc(researchJobs.createdAt))
      .limit(20);
    res.json(jobs.map(formatJob));
  } catch (err) {
    logger.error({ err }, "Error listing research jobs");
    res.status(500).json({ error: "Failed to list research jobs" });
  }
});

// POST /research — create + start research job
router.post("/research", async (req, res) => {
  const parse = StartResearchBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { company } = parse.data;

  try {
    const [job] = await db
      .insert(researchJobs)
      .values({ company, status: "pending" })
      .returning();
    res.status(201).json(formatJob(job));
  } catch (err) {
    logger.error({ err }, "Error creating research job");
    res.status(500).json({ error: "Failed to create research job" });
  }
});

// GET /research/:id/stream — SSE streaming research progress
router.get("/research/:id/stream", async (req, res) => {
  const parse = GetResearchParams.safeParse(req.params);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { id } = parse.data;

  const [job] = await db
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.id, id));

  if (!job) {
    res.status(404).json({ error: "Research job not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (job.status === "completed" || job.status === "failed") {
    send({ type: "done", job: formatJob(job) });
    res.end();
    return;
  }

  await db
    .update(researchJobs)
    .set({ status: "running" })
    .where(eq(researchJobs.id, id));

  send({ type: "step", content: `Starting research on ${job.company}...` });

  try {
    const result = await runInvestmentResearch(job.company, (step: string) => {
      send({ type: "step", content: step });
    });

    const [updated] = await db
      .update(researchJobs)
      .set({
        status: "completed",
        verdict: result.verdict,
        summary: result.summary,
        reasoning: result.reasoning,
        sources: result.sources,
        confidence: result.confidence,
        details: result.details,
        completedAt: new Date(),
      })
      .where(eq(researchJobs.id, id))
      .returning();

    send({ type: "done", job: formatJob(updated) });
  } catch (err) {
    logger.error({ err }, "Research agent failed");
    const errMsg = err instanceof Error ? err.message : "Research failed. Please try again.";
    await db
      .update(researchJobs)
      .set({ status: "failed" })
      .where(eq(researchJobs.id, id));
    send({ type: "error", message: errMsg });
  }

  res.end();
});

// GET /research/:id
router.get("/research/:id", async (req, res) => {
  const parse = GetResearchParams.safeParse(req.params);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { id } = parse.data;

  try {
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.id, id));

    if (!job) {
      res.status(404).json({ error: "Research job not found" });
      return;
    }

    res.json(formatJob(job));
  } catch (err) {
    logger.error({ err }, "Error fetching research job");
    res.status(500).json({ error: "Failed to fetch research job" });
  }
});

function formatJob(job: typeof researchJobs.$inferSelect) {
  return {
    id: job.id,
    company: job.company,
    status: job.status,
    verdict: job.verdict ?? null,
    summary: job.summary ?? null,
    reasoning: (job.reasoning as string[] | null) ?? null,
    sources: (job.sources as string[] | null) ?? null,
    confidence: job.confidence ?? null,
    details: job.details ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export default router;
