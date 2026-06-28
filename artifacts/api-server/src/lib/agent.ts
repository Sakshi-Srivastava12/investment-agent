import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { logger } from "./logger";
import type { ResearchDetails } from "@workspace/db";

export interface ResearchResult {
  verdict: "invest" | "pass" | "unknown";
  summary: string;
  reasoning: string[];
  sources: string[];
  confidence: number;
  details: ResearchDetails;
}

// Custom Tavily search tool
const tavilySearchTool = tool(
  async ({ query }: { query: string }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);

    const data = (await response.json()) as {
      answer?: string;
      results: Array<{ title: string; url: string; content: string }>;
    };

    const results = data.results.map(
      (r) => `[${r.title}](${r.url})\n${r.content}`
    );
    if (data.answer) results.unshift(`Summary: ${data.answer}`);
    return results.join("\n\n---\n\n");
  },
  {
    name: "web_search",
    description: "Search the web for up-to-date company and financial information.",
    schema: z.object({ query: z.string() }),
  }
);

function extractUrls(content: string): string[] {
  const urlPattern = /\(https?:\/\/[^\s)]+\)/g;
  const matches = content.match(urlPattern) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

async function validateCompany(
  company: string
): Promise<{ valid: boolean; reason: string }> {
  const searchRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY!,
      query: `${company} company publicly traded stock investment`,
      search_depth: "basic",
      max_results: 3,
    }),
  });

  let snippets = "";
  if (searchRes.ok) {
    const data = (await searchRes.json()) as {
      results: Array<{ title: string; content: string }>;
    };
    snippets = data.results
      .map((r) => `${r.title}: ${r.content}`)
      .join("\n")
      .slice(0, 1200);
  }

  const validator = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY!,
  });

  const judgment = await validator.invoke([
    new HumanMessage(
      `You are a financial research gatekeeper. Is "${company}" a real company that a stock/investment analyst would research?

Web search evidence:
${snippets || "(no results found)"}

Rules:
- YES if: publicly traded, major private company (SpaceX, OpenAI, Stripe), or significant startup covered by financial media.
- NO if: random word, person's first/last name only, fictional entity, or tiny local business with no investment relevance.

Respond with exactly one word — YES or NO — then a single sentence explanation.`
    ),
  ]);

  const text = ((judgment.content as string) ?? "").trim();
  const valid = /^yes/i.test(text);
  logger.info({ company, valid, judgment: text }, "Company validation result");
  return { valid, reason: text };
}

export async function runInvestmentResearch(
  company: string,
  onStep: (step: string) => void
): Promise<ResearchResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");

  // ── Step 0: Validate ────────────────────────────────────────────────────
  onStep(`Validating "${company}" as an investable entity...`);
  const { valid, reason } = await validateCompany(company);

  if (!valid) {
    onStep("⚠ Entity not recognised as an investable company.");
    return {
      verdict: "unknown",
      confidence: 0,
      summary: `"${company}" could not be identified as a real, investable company. ${reason.replace(/^no[,\s-]*/i, "").trim()} Please enter a valid company name or stock ticker (e.g. Apple, AAPL, Infosys, SpaceX).`,
      reasoning: [
        "No reliable financial data or stock market records found.",
        "The input does not match any publicly traded or well-known private firm.",
        "Please try a recognised ticker symbol or full company name.",
      ],
      sources: [],
      details: {},
    };
  }

  // ── Step 1–5: Full research agent ────────────────────────────────────────
  onStep(`Confirmed. Initiating deep-dive research on ${company}...`);

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-pro",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });

  const agent = createReactAgent({
    llm: model,
    tools: [tavilySearchTool],
    messageModifier: `You are an expert investment research analyst. Research ${company} using ONLY real web data. Never invent numbers.`,
  });

  const collectedSources: string[] = [];
  let stepCount = 0;

  const progressMessages = [
    `Fetching ${company} company overview and profile...`,
    `Pulling stock price, market cap, and key metrics...`,
    `Analysing revenue, margins, and financial ratios...`,
    `Scanning latest news and analyst sentiment...`,
    `Mapping competitive landscape and risk factors...`,
    `Generating investment thesis and scoring...`,
  ];

  const researchPrompt = `Research ${company} as an investment opportunity using ONLY facts from web search. Perform exactly these 5 searches:

1. "${company} company overview ticker symbol sector CEO headquarters founded exchange listing"
2. "${company} stock price today 52 week high low market cap volume PE ratio EPS 2025"
3. "${company} revenue net margin ROE debt equity ratio dividend yield beta 2024 2025"
4. "${company} latest news 2025 analyst recommendation sentiment"
5. "${company} risks challenges competition regulatory concerns investor concerns"

After ALL 5 searches, respond with ONLY this JSON (no markdown, no code blocks, no extra text):
{
  "verdict": "invest" or "pass",
  "confidence": <integer 1-10>,
  "summary": "<2-3 sentence executive summary with specific data points>",
  "companyInfo": {
    "ticker": "<stock ticker, e.g. AAPL or INFY.NS>",
    "sector": "<sector name>",
    "exchange": "<exchange, e.g. NSE, NYSE, NASDAQ>",
    "ceo": "<CEO full name>",
    "headquarters": "<City, Country>",
    "founded": "<founding year>",
    "industry": "<specific industry>",
    "marketCap": "<market cap with currency, e.g. ₹5,200 Cr or $2.3T>"
  },
  "stockData": {
    "price": "<current price with currency symbol>",
    "change": "<today's change, e.g. +12.50>",
    "changePercent": "<percent, e.g. +1.24%>",
    "high52w": "<52-week high with currency>",
    "low52w": "<52-week low with currency>",
    "volume": "<trading volume, e.g. 2.3M>",
    "pe": "<P/E ratio>",
    "eps": "<EPS with currency>",
    "dividend": "<dividend yield, e.g. 1.8%>",
    "revenue": "<annual revenue with currency>",
    "netMargin": "<net profit margin, e.g. 14.2%>",
    "roe": "<return on equity, e.g. 22.1%>",
    "debtEquity": "<D/E ratio>",
    "beta": "<beta value>"
  },
  "news": [
    { "headline": "<recent news headline>", "url": "<source url or empty string>", "sentiment": "positive|negative|neutral" },
    { "headline": "<recent news headline>", "url": "<source url or empty string>", "sentiment": "positive|negative|neutral" },
    { "headline": "<recent news headline>", "url": "<source url or empty string>", "sentiment": "positive|negative|neutral" }
  ],
  "bull": [
    "<bull case point 1 with specific data>",
    "<bull case point 2 with specific data>",
    "<bull case point 3 with specific data>"
  ],
  "bear": [
    "<bear case point 1 with specific data>",
    "<bear case point 2 with specific data>",
    "<bear case point 3 with specific data>"
  ],
  "scores": {
    "overall": <0-100>,
    "financials": <0-100>,
    "valuation": <0-100>,
    "growth": <0-100>,
    "risk": <0-100>,
    "news": <0-100>,
    "sentiment": <0-100>
  },
  "confidenceBreakdown": {
    "financialData": <1-5>,
    "newsQuality": <1-5>,
    "analystConsensus": <1-5>,
    "marketSentiment": <1-5>
  },
  "reasoning": [
    "<key insight 1 with actual numbers>",
    "<key insight 2 with actual numbers>",
    "<key insight 3 with actual numbers>"
  ]
}

Use "N/A" for any field you cannot find data for. Never leave a field undefined.`;

  onStep(progressMessages[0]);

  const agentStream = await agent.stream(
    { messages: [new HumanMessage(researchPrompt)] },
    { streamMode: "values" }
  );

  let finalMessage = "";

  for await (const chunk of agentStream) {
    const messages: unknown[] = chunk.messages ?? [];
    if (messages.length === 0) continue;

    const lastMsg = messages[messages.length - 1] as {
      _getType?: () => string;
      content?: unknown;
    };

    const msgType = lastMsg._getType?.() ?? "";

    if (msgType === "tool") {
      stepCount++;
      const idx = Math.min(stepCount, progressMessages.length - 1);
      onStep(progressMessages[idx]);

      if (typeof lastMsg.content === "string") {
        const urls = extractUrls(lastMsg.content);
        for (const url of urls) {
          if (!collectedSources.includes(url)) collectedSources.push(url);
        }
      }
    }

    if (msgType === "ai") {
      const content = lastMsg.content;
      const text = typeof content === "string" ? content : JSON.stringify(content);
      if (text.trim().startsWith("{") || text.includes('"verdict"')) {
        finalMessage = text;
      }
    }
  }

  onStep("Synthesizing data and generating investment verdict...");

  let parsed: {
    verdict: string;
    confidence: number;
    summary: string;
    companyInfo?: Record<string, string>;
    stockData?: Record<string, string>;
    news?: Array<{ headline: string; url?: string; sentiment: string }>;
    bull?: string[];
    bear?: string[];
    scores?: Record<string, number>;
    confidenceBreakdown?: Record<string, number>;
    reasoning?: string[];
  };

  try {
    const cleaned = finalMessage
      .replace(/^```json\s*/m, "")
      .replace(/^```\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error({ err, finalMessage }, "Failed to parse agent JSON");
    throw new Error("Agent returned unparseable output. Please try again.");
  }

  const rawVerdict = (parsed.verdict ?? "").toLowerCase();

  const details: ResearchDetails = {
    companyInfo: parsed.companyInfo as ResearchDetails["companyInfo"],
    stockData: parsed.stockData as ResearchDetails["stockData"],
    news: (parsed.news ?? []).map((n) => ({
      headline: n.headline,
      url: n.url,
      sentiment: (["positive", "negative", "neutral"].includes(n.sentiment)
        ? n.sentiment
        : "neutral") as "positive" | "negative" | "neutral",
    })),
    bull: Array.isArray(parsed.bull) ? parsed.bull : [],
    bear: Array.isArray(parsed.bear) ? parsed.bear : [],
    scores: parsed.scores as ResearchDetails["scores"],
    confidenceBreakdown: parsed.confidenceBreakdown as ResearchDetails["confidenceBreakdown"],
  };

  return {
    verdict: rawVerdict === "invest" ? "invest" : "pass",
    confidence: Math.max(1, Math.min(10, Math.round(parsed.confidence ?? 5))),
    summary: typeof parsed.summary === "string" ? parsed.summary : `Analysis of ${company} complete.`,
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [],
    sources: collectedSources.slice(0, 8),
    details,
  };
}
