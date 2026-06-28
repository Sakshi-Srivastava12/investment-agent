# AI Investment Research Agent

> Built for the InsideIIM × Altuni AI Labs AI Product Development Engineer (Intern) assignment.

An autonomous AI agent that accepts a company name, conducts multi-step financial and market research using real-time web search, and delivers a structured **Invest** or **Pass** verdict with detailed reasoning.

---

## Overview

The AI Investment Research Agent automates the first-pass investment research process. A user enters any company name or ticker, and the agent:

1. Searches the web for company overview and business model
2. Pulls recent financial results and earnings data
3. Scans the latest news and developments
4. Maps the competitive landscape
5. Assesses key risks and concerns

After 5 targeted web searches, a GPT-4o model synthesizes the findings and returns a structured JSON verdict: **Invest** or **Pass**, with a confidence score (1–10), an executive summary, and 5+ bulleted reasoning points.

The entire research process streams live to the UI — users watch each research step appear in real time before the final verdict animates in.

---

## How to Run It

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A PostgreSQL database (or use Replit's built-in DB)
- Two API keys (see below)

### Required API Keys

| Variable | Where to get it | Cost |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | ~$0.01–0.05 per research run (GPT-4o) |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) | Free tier: 1,000 searches/month |

### Setup Steps

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd <project-dir>

# 2. Install dependencies
pnpm install

# 3. Set environment variables
cp .env.example .env
# Fill in DATABASE_URL, OPENAI_API_KEY, TAVILY_API_KEY

# 4. Push database schema
pnpm --filter @workspace/db run push

# 5. Start the API server (runs on port 5000 by default)
pnpm --filter @workspace/api-server run dev

# 6. Start the frontend (in a separate terminal)
pnpm --filter @workspace/investment-agent run dev
```

Then open `http://localhost:<FRONTEND_PORT>` in your browser.

### Environment Variables

```env
DATABASE_URL=postgres://...      # PostgreSQL connection string
OPENAI_API_KEY=sk-...            # OpenAI API key
TAVILY_API_KEY=tvly-...          # Tavily search API key
PORT=5000                        # API server port (set by workflow)
```

---

## How It Works — Approach and Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite, TanStack Query, Wouter, Tailwind CSS |
| **Backend** | Express 5, Node.js 24, TypeScript |
| **AI Agent** | LangChain.js + LangGraph (`createReactAgent`) |
| **LLM** | OpenAI GPT-4o |
| **Web Search** | Tavily Search API (real-time web results) |
| **Database** | PostgreSQL + Drizzle ORM |
| **API Contract** | OpenAPI 3.1 (code-first with Orval codegen) |

### Architecture Diagram

```
Browser (React SPA)
    │
    ├── GET /api/research          → list recent jobs
    ├── POST /api/research         → create job (returns id)
    ├── GET /api/research/:id      → get job status/result
    ├── GET /api/research/stats    → aggregate stats
    └── GET /api/research/:id/stream  ← SSE (streaming progress)
                │
                ▼
        Express API Server
                │
                ▼
        LangGraph ReAct Agent
          ┌─────────────┐
          │  GPT-4o     │ ◄──── system prompt + research task
          │  LLM        │
          └──────┬──────┘
                 │ tool_calls
                 ▼
        ┌────────────────┐
        │ Tavily Search  │ → 5 targeted web searches
        │ Tool (REST)    │
        └────────────────┘
                 │
                 ▼
        Structured JSON verdict
        (saved to PostgreSQL)
```

### Agent Design

The agent uses **LangGraph's `createReactAgent`** — a ReAct (Reasoning + Acting) loop where the model alternates between:
- **Thinking**: deciding what to search for next
- **Acting**: calling the Tavily web search tool
- **Observing**: reading search results and updating its understanding

The agent is instructed to perform exactly 5 searches covering company overview, financials, recent news, competition, and risks — then output a structured JSON verdict.

### Streaming (SSE)

The research detail page opens a native `EventSource` connection to `/api/research/:id/stream`. As the agent runs, the server emits:
- `{ type: "step", content: "..." }` — live progress messages
- `{ type: "done", job: {...} }` — final ResearchJob with verdict
- `{ type: "error", message: "..." }` — if something fails

Results are persisted to PostgreSQL so repeated visits to `/research/:id` return cached results instantly.

---

## Key Decisions and Trade-offs

### 1. LangGraph ReAct over a custom pipeline
**Chose:** `createReactAgent` (LangGraph) for the agentic loop  
**Why:** The ReAct pattern lets GPT-4o dynamically decide search queries based on what it finds — more adaptive than a fixed 5-step pipeline. The model can refine its searches based on intermediate results.  
**Trade-off:** Less predictable step count; mitigated by instructing the model to perform exactly 5 searches.

### 2. Tavily REST API via custom LangChain tool
**Chose:** Direct Tavily REST API call wrapped in `@langchain/core/tools`'s `tool()` helper  
**Why:** The `@langchain/community/tools/tavily_search` subpath isn't exported in the installed package version — the REST approach is version-agnostic and avoids bundler issues.  
**Trade-off:** Slightly more code, but more portable and reliable.

### 3. SSE streaming instead of WebSockets
**Chose:** Server-Sent Events (SSE) for real-time progress  
**Why:** SSE is simpler to implement than WebSockets for unidirectional server→client streams. No additional infrastructure needed. Native browser `EventSource` API handles reconnection.  
**Trade-off:** Cannot send client→server messages over the same connection; acceptable for this read-only stream.

### 4. Results persisted to PostgreSQL
**Chose:** Store full research results in DB  
**Why:** Users can revisit past research. Prevents redundant agent runs on page refresh. Enables the aggregate stats dashboard.  
**Trade-off:** Cold starts require DB provisioning. Research history is server-side only (no export yet).

### 5. GPT-4o model
**Chose:** `gpt-4o` over cheaper alternatives  
**Why:** Investment research reasoning requires nuanced synthesis of financial data, news, and competitive context. GPT-4o's stronger reasoning produces more reliable structured JSON output and better quality verdicts.  
**Trade-off:** Higher cost (~$0.03–0.05/run) vs. GPT-4o-mini (~$0.005/run). A production version could add a model selection toggle.

### What Was Left Out
- **User authentication** — all research is global, not per-user
- **Portfolio tracking** — could track watched companies over time
- **Historical price data** — Tavily web search doesn't return structured financial data; a Yahoo Finance integration would add OHLCV data
- **PDF export** — research reports as downloadable PDFs
- **Confidence calibration** — the confidence score is LLM-generated and not statistically calibrated
- **Rate limiting** — no per-IP limits on research requests

---

## Example Runs

### Example 1: Apple (AAPL) — Invest

```
Company: Apple

Verdict: INVEST  (Confidence: 9/10)

Summary: Apple continues to demonstrate exceptional financial performance with record 
revenue exceeding $391 billion in FY2024, driven by its Services segment growing 
at 13% YoY. The company's ecosystem lock-in, strong brand loyalty, and expanding 
AI integration via Apple Intelligence position it favorably for sustained growth.

Reasoning:
• Record revenue of $391B in FY2024 with Services reaching $96B (24% of revenue), 
  showing strong diversification beyond hardware
• iPhone 16 lineup incorporating Apple Intelligence AI features, opening new upgrade 
  cycle among the 1.2B active iPhone users worldwide
• $110B share buyback authorization demonstrates management confidence and provides 
  EPS support through capital returns
• Operating margins of 31.5% — among the highest in big tech — reflecting premium 
  pricing power and operational efficiency
• Emerging markets (India, Southeast Asia) showing double-digit growth, providing 
  long runway as developed market saturation approaches

Sources: [apple.com earnings, reuters.com, bloomberg.com, ...]
```

### Example 2: WeWork — Pass

```
Company: WeWork

Verdict: PASS  (Confidence: 9/10)

Summary: WeWork filed for Chapter 11 bankruptcy in November 2023 and has been 
restructuring its operations and lease obligations. While it has emerged from 
bankruptcy with a reduced footprint, significant uncertainty remains around its 
path to profitability and competitive positioning against Regus and hybrid work trends.

Reasoning:
• Filed Chapter 11 bankruptcy in November 2023, wiping out common equity holders 
  and leaving significant uncertainty about the reorganized entity
• Still carries substantial lease obligations despite renegotiating hundreds of 
  locations — fixed cost structure remains a fundamental vulnerability
• Flexible workspace market increasingly competitive with IWG/Regus, CBRE, and 
  corporate real estate teams building in-house solutions
• No clear path to EBITDA profitability; continued cash burn post-restructuring
• Hybrid work stabilizing at lower office utilization rates than pre-pandemic, 
  reducing addressable market for premium flex space

Sources: [wsj.com, ft.com, reuters.com, ...]
```

### Example 3: Nvidia (NVDA) — Invest

```
Company: Nvidia

Verdict: INVEST  (Confidence: 10/10)

Summary: Nvidia is the dominant infrastructure provider for the AI compute buildout, 
with data center revenue growing 409% YoY to $47.5B in FY2024. Its CUDA software 
moat, Blackwell GPU architecture, and expanding software/services layer (DGX Cloud, 
NIM microservices) create durable competitive advantages in the AI supercycle.

Reasoning:
• Data center revenue of $47.5B in FY2024 (+409% YoY) driven by hyperscaler 
  AI infrastructure investment — Microsoft, Google, Amazon, Meta collectively 
  spending $200B+ on AI capex in 2024
• CUDA ecosystem represents a decade-long software moat — millions of AI researchers 
  trained on CUDA, switching costs to AMD ROCm or Intel Gaudi remain extremely high
• Blackwell architecture (B100/B200) already oversold for 2025, with demand 
  significantly exceeding supply capacity
• Gross margins expanding to 76%+ as software and services (AI Enterprise, DGX Cloud) 
  become a larger revenue mix
• Sovereign AI tailwind: governments worldwide investing in national AI infrastructure, 
  providing new customer segment beyond hyperscalers

Sources: [nvidia.com, seekingalpha.com, techcrunch.com, ...]
```

---

## What I Would Improve With More Time

1. **Structured financial data integration** — connect to Yahoo Finance or Alpha Vantage API to pull real P/E ratios, revenue growth rates, and debt/equity ratios as structured data (not just Tavily text search)

2. **Multi-model comparison** — run the same company through multiple LLMs (GPT-4o, Claude Sonnet, Gemini) and show a "consensus" verdict across models

3. **Portfolio watchlist** — let users save companies and get periodic re-analysis when material news appears

4. **Confidence calibration** — backtest historical verdicts against actual stock returns to calibrate the confidence score statistically

5. **PDF export** — generate a formatted 1-page investment memo as a downloadable PDF using Puppeteer

6. **Competitor comparison** — when researching Company A, automatically research its top 2 competitors and show a side-by-side comparison table

7. **News alerts** — webhook/email notifications when a previously-researched company has major news

8. **Cost optimization** — cache search results for 24 hours so the same company searched twice in a day doesn't double API costs

---

## LLM Chat Transcript (BONUS)

This project was built using Replit Agent (powered by Anthropic's Claude). The entire development session — from initial architecture design through debugging LangChain package exports, fixing esbuild bundling of LangChain packages, and iterating on the agent prompt format — was conducted as a continuous AI-assisted build session.

Key architectural decisions made during the LLM session:
- **LangGraph over raw LangChain**: The agent recommended `createReactAgent` from LangGraph for its cleaner ReAct loop management
- **Custom Tavily tool**: When `@langchain/community/tools/tavily_search` failed due to package export issues, the agent pivoted to a direct REST API implementation
- **SSE over polling**: Agent recommended SSE for a better UX than polling `/research/:id` every second
- **esbuild externalization**: LangChain's complex subpath exports required all `@langchain/*` packages to be externalized in the esbuild config

The complete transcript of this build session represents the LLM-human collaboration that produced this codebase.

---

## Project Structure

```
artifacts/
  api-server/          # Express 5 backend
    src/
      routes/
        research.ts    # Research CRUD + SSE stream
        health.ts      # Health check
      lib/
        agent.ts       # LangGraph ReAct agent + Tavily tool
        logger.ts      # Pino structured logging
  investment-agent/    # React + Vite frontend
    src/
      pages/
        home.tsx           # Search + history dashboard
        research-detail.tsx # Live streaming + verdict display
      components/
        layout.tsx         # App shell + navigation
lib/
  api-spec/
    openapi.yaml       # OpenAPI 3.1 contract (source of truth)
  api-client-react/    # Generated React Query hooks (from codegen)
  api-zod/             # Generated Zod schemas (from codegen)
  db/
    src/schema/
      research.ts      # Drizzle ORM schema for research_jobs
```
