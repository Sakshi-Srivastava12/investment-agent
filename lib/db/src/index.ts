import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Auto-initialize the database table if it doesn't exist
// (Useful since the Render build command skipped the db:push step)
pool.query(`
CREATE TABLE IF NOT EXISTS research_jobs (
  id SERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verdict TEXT,
  summary TEXT,
  reasoning JSONB,
  sources JSONB,
  confidence INTEGER,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);
`).catch((err) => {
  console.error("Failed to initialize database tables:", err);
});

export * from "./schema";
