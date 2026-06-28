import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetResearch,
  getGetResearchQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, AlertCircle, ExternalLink, Activity,
  TrendingUp, TrendingDown, CheckCircle2, Circle, Clock, Hash,
  BarChart3, Newspaper, Globe, ShieldCheck, ShieldAlert, Star,
  ChevronRight, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NewsItem = { headline: string; url?: string; sentiment: "positive" | "negative" | "neutral" };
type ScoreBreakdown = { overall: number; financials: number; valuation: number; growth: number; risk: number; news: number; sentiment: number };
type ConfidenceBreakdown = { financialData: number; newsQuality: number; analystConsensus: number; marketSentiment: number };
type CompanyInfo = { ticker?: string; sector?: string; exchange?: string; ceo?: string; headquarters?: string; founded?: string; industry?: string; marketCap?: string };
type StockData = { price?: string; change?: string; changePercent?: string; high52w?: string; low52w?: string; volume?: string; pe?: string; eps?: string; dividend?: string; revenue?: string; netMargin?: string; roe?: string; debtEquity?: string; beta?: string };
type Details = { companyInfo?: CompanyInfo; stockData?: StockData; news?: NewsItem[]; bull?: string[]; bear?: string[]; scores?: ScoreBreakdown; confidenceBreakdown?: ConfidenceBreakdown };

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < count ? "fill-yellow-400 text-yellow-400" : "text-border"}`} />
      ))}
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="font-bold text-white">{value}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value?: string }) {
  const isNA = !value || value === "N/A" || value === "n/a";
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-bold font-mono ${isNA ? "text-muted-foreground" : "text-white"}`}>
        {isNA ? "—" : value}
      </span>
    </div>
  );
}

const PIPELINE_STEPS = [
  "Validating entity",
  "Company overview",
  "Market & stock data",
  "Financial metrics",
  "News & sentiment",
  "Risks & competition",
  "Generating verdict",
];

export default function ResearchDetail() {
  const { id } = useParams<{ id: string }>();
  const researchId = parseInt(id, 10);
  const queryClient = useQueryClient();

  const { data: research, isLoading, error } = useGetResearch(researchId);
  const [steps, setSteps] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!research) return undefined;
    if (research.status === "pending" || research.status === "running") {
      setIsStreaming(true);
      const es = new EventSource(`/api/research/${researchId}/stream`);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "step") {
            setSteps((prev) => [...prev, event.content]);
          } else if (event.type === "done" || event.type === "error") {
            setIsStreaming(false);
            if (event.type === "error") setSteps((prev) => [...prev, `⚠ ${event.message ?? "Research failed."}`]);
            queryClient.invalidateQueries({ queryKey: getGetResearchQueryKey(researchId) });
            es.close();
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        setIsStreaming(false);
        queryClient.invalidateQueries({ queryKey: getGetResearchQueryKey(researchId) });
        es.close();
      };
      return () => es.close();
    }
    return undefined;
  }, [research?.status, researchId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !research) {
    return (
      <div className="container py-12 px-4 max-w-4xl text-center space-y-4">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">Intel Not Found</h2>
        <p className="text-muted-foreground">Could not retrieve research dossier for ID: {id}</p>
        <Button asChild variant="outline"><Link href="/">Return to Dashboard</Link></Button>
      </div>
    );
  }

  const isCompleted = research.status === "completed";
  const isFailed = research.status === "failed";
  const isUnknown = isCompleted && research.verdict === "unknown";
  const isInvest = isCompleted && research.verdict === "invest";

  // Cast details safely
  const details = (research as { details?: Details }).details ?? {} as Details;
  const { companyInfo, stockData, news, bull, bear, scores, confidenceBreakdown } = details;

  return (
    <div className="min-h-screen pb-16">
      {/* Sticky top nav */}
      <div className="border-b border-border/40 bg-background/90 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-5xl px-4 md:px-8 h-12 flex items-center">
          <Link href="/" className="inline-flex items-center text-xs font-mono text-muted-foreground hover:text-white transition-colors gap-1.5">
            <ArrowLeft className="h-3 w-3" /> BACK TO MATRIX
          </Link>
        </div>
      </div>

      <div className="container max-w-5xl px-4 md:px-8 py-8 space-y-6 animate-in fade-in duration-500">

        {/* ── VERDICT HERO (completed, known) ── */}
        {isCompleted && !isUnknown && (
          <div className={`rounded-2xl border-2 p-6 md:p-8 ${isInvest ? "border-invest/50 bg-invest/5 shadow-invest/10" : "border-pass/50 bg-pass/5 shadow-pass/10"} shadow-2xl`}>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="space-y-3 flex-1 min-w-0">
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground">RESEARCH TARGET</p>
                <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-none">{research.company}</h1>
                {companyInfo && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {companyInfo.ticker && companyInfo.ticker !== "N/A" && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-xs font-mono font-bold text-white">{companyInfo.ticker}</span>
                    )}
                    {companyInfo.exchange && companyInfo.exchange !== "N/A" && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-border/40 text-xs font-mono text-muted-foreground">{companyInfo.exchange}</span>
                    )}
                    {companyInfo.sector && companyInfo.sector !== "N/A" && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-border/40 text-xs font-mono text-muted-foreground">{companyInfo.sector}</span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{research.id.toString().padStart(4, "0")}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(research.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Score ring */}
                {scores && (
                  <div className="text-center">
                    <p className="text-[9px] font-mono tracking-widest text-muted-foreground mb-1">SCORE</p>
                    <div className="relative w-16 h-16">
                      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                        <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-border/40" />
                        <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6"
                          strokeDasharray={`${(scores.overall / 100) * 163} 163`}
                          strokeLinecap="round"
                          stroke={isInvest ? "#22c55e" : "#f97316"}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-lg font-black font-mono">{scores.overall}</span>
                    </div>
                  </div>
                )}
                {/* Verdict chip */}
                <div className={`flex flex-col items-center justify-center px-6 py-4 rounded-xl border-2 ${isInvest ? "border-invest bg-invest/20" : "border-pass bg-pass/20"}`}>
                  <p className="text-[9px] font-mono tracking-widest opacity-70 mb-1">SYSTEM VERDICT</p>
                  <div className="flex items-center gap-2">
                    {isInvest ? <TrendingUp className="h-5 w-5 text-invest" /> : <TrendingDown className="h-5 w-5 text-pass" />}
                    <span className={`text-3xl font-black tracking-tight ${isInvest ? "text-invest" : "text-pass"}`}>
                      {research.verdict?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PROCESSING HEADER ── */}
        {!isCompleted && !isFailed && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-black tracking-tight text-white">{research.company}</h1>
              <Badge variant="outline" className="animate-pulse bg-primary/10 text-primary border-primary/20 font-mono">PROCESSING</Badge>
            </div>
            <div className="text-xs font-mono text-muted-foreground flex gap-4">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{research.id.toString().padStart(4, "0")}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(research.createdAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ── UNKNOWN ENTITY ── */}
        {isUnknown && (
          <>
            <div className="space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-white">{research.company}</h1>
              <div className="text-xs font-mono text-muted-foreground flex gap-4">
                <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{research.id.toString().padStart(4, "0")}</span>
              </div>
            </div>
            <Card className="bg-yellow-500/5 border-yellow-500/30">
              <CardContent className="p-6 flex items-start gap-4">
                <AlertCircle className="h-8 w-8 text-yellow-400 shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <h3 className="font-bold font-mono text-yellow-400 text-lg">ENTITY NOT RECOGNISED</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{research.summary}</p>
                  <div className="border-t border-yellow-500/20 pt-3">
                    <p className="text-xs font-mono text-muted-foreground mb-2">TRY SEARCHING FOR:</p>
                    <div className="flex flex-wrap gap-2">
                      {["Apple", "Tesla", "Infosys", "AAPL", "SpaceX", "Reliance Industries", "MTAR"].map((ex) => (
                        <span key={ex} className="px-2 py-0.5 rounded border border-border/50 text-xs font-mono text-gray-400">{ex}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── FAILED ── */}
        {isFailed && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-6 flex items-center gap-4 text-destructive">
              <AlertCircle className="h-8 w-8 shrink-0" />
              <div>
                <h3 className="font-bold font-mono">PROCESS TERMINATED</h3>
                <p className="text-sm opacity-80">The research agents encountered a critical failure. Please try again.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── LIVE TERMINAL + PIPELINE (processing) ── */}
        {!isCompleted && !isFailed && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terminal feed */}
            <div className="md:col-span-2">
              <Card className="bg-card/50 border-primary/20 h-full">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-sm font-mono flex items-center gap-2 text-primary">
                    <Activity className="h-4 w-4 animate-pulse" /> LIVE TERMINAL FEED
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 font-mono text-sm space-y-3 h-64 overflow-y-auto flex flex-col justify-end">
                  {steps.length === 0 && <div className="text-muted-foreground animate-pulse">Initializing reconnaissance agents...</div>}
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-3 animate-in slide-in-from-bottom-2">
                      <span className="text-primary/50 shrink-0">&gt;</span>
                      <span className="text-gray-300">{step}</span>
                    </div>
                  ))}
                  {isStreaming && (
                    <div className="flex gap-3 text-primary animate-pulse">
                      <span className="shrink-0">&gt;</span><span>_</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pipeline */}
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest">RESEARCH PIPELINE</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {PIPELINE_STEPS.map((label, idx) => {
                  const done = idx < steps.length;
                  const active = idx === steps.length;
                  return (
                    <div key={label} className={`flex items-center gap-3 text-sm font-mono transition-colors ${done ? "text-invest" : active ? "text-white animate-pulse" : "text-muted-foreground"}`}>
                      {done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Circle className="h-4 w-4 shrink-0 opacity-40" />}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── RESULTS (completed + known) ── */}
        {isCompleted && !isUnknown && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* ── COMPANY PROFILE ── */}
            {companyInfo && Object.values(companyInfo).some((v) => v && v !== "N/A") && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" /> COMPANY PROFILE
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCell label="Ticker" value={companyInfo.ticker} />
                    <MetricCell label="Exchange" value={companyInfo.exchange} />
                    <MetricCell label="Sector" value={companyInfo.sector} />
                    <MetricCell label="Industry" value={companyInfo.industry} />
                    <MetricCell label="Market Cap" value={companyInfo.marketCap} />
                    <MetricCell label="Founded" value={companyInfo.founded} />
                    <MetricCell label="CEO" value={companyInfo.ceo} />
                    <MetricCell label="HQ" value={companyInfo.headquarters} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STOCK & FINANCIAL METRICS ── */}
            {stockData && Object.values(stockData).some((v) => v && v !== "N/A") && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5" /> MARKET DATA &amp; FINANCIALS
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Price row */}
                  {stockData.price && stockData.price !== "N/A" && (
                    <div className="flex flex-wrap items-end gap-4 pb-4 border-b border-border/40">
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground mb-1">CURRENT PRICE</p>
                        <p className="text-4xl font-black font-mono text-white">{stockData.price}</p>
                      </div>
                      {stockData.changePercent && stockData.changePercent !== "N/A" && (
                        <div className={`flex items-center gap-1 text-lg font-bold font-mono pb-1 ${stockData.changePercent.startsWith("+") ? "text-invest" : "text-pass"}`}>
                          {stockData.changePercent.startsWith("+") ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                          {stockData.changePercent}
                        </div>
                      )}
                      {stockData.change && stockData.change !== "N/A" && (
                        <div className="text-sm font-mono text-muted-foreground pb-1">{stockData.change} today</div>
                      )}
                    </div>
                  )}
                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    <MetricCell label="52W High" value={stockData.high52w} />
                    <MetricCell label="52W Low" value={stockData.low52w} />
                    <MetricCell label="Volume" value={stockData.volume} />
                    <MetricCell label="P/E Ratio" value={stockData.pe} />
                    <MetricCell label="EPS" value={stockData.eps} />
                    <MetricCell label="Revenue" value={stockData.revenue} />
                    <MetricCell label="Net Margin" value={stockData.netMargin} />
                    <MetricCell label="ROE" value={stockData.roe} />
                    <MetricCell label="Debt/Equity" value={stockData.debtEquity} />
                    <MetricCell label="Beta" value={stockData.beta} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── EXECUTIVE SUMMARY ── */}
            <Card className="bg-card/60 border-border/60">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest">EXECUTIVE SUMMARY</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <p className="text-base md:text-lg leading-relaxed text-gray-100 font-light">{research.summary}</p>
              </CardContent>
            </Card>

            {/* ── INVESTMENT SCORE BREAKDOWN ── */}
            {scores && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest">INVESTMENT SCORE BREAKDOWN</CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                      <p className="text-xs font-mono text-muted-foreground tracking-widest">OVERALL SCORE</p>
                      <div className="relative w-28 h-28">
                        <svg viewBox="0 0 112 112" className="w-28 h-28 -rotate-90">
                          <circle cx="56" cy="56" r="46" fill="none" stroke="currentColor" strokeWidth="8" className="text-border/40" />
                          <circle cx="56" cy="56" r="46" fill="none" strokeWidth="8"
                            strokeDasharray={`${(scores.overall / 100) * 289} 289`}
                            strokeLinecap="round"
                            stroke={isInvest ? "#22c55e" : "#f97316"}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-black font-mono">{scores.overall}</span>
                          <span className="text-xs text-muted-foreground font-mono">/100</span>
                        </div>
                      </div>
                      <Badge className={`font-mono text-xs ${scores.overall >= 70 ? "bg-invest/20 text-invest border-invest/30" : scores.overall >= 50 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-pass/20 text-pass border-pass/30"}`} variant="outline">
                        {scores.overall >= 70 ? "STRONG" : scores.overall >= 50 ? "MODERATE" : "WEAK"}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      <ScoreBar label="Financials" value={scores.financials} color={scores.financials >= 70 ? "bg-invest" : scores.financials >= 50 ? "bg-yellow-400" : "bg-pass"} />
                      <ScoreBar label="Valuation" value={scores.valuation} color={scores.valuation >= 70 ? "bg-invest" : scores.valuation >= 50 ? "bg-yellow-400" : "bg-pass"} />
                      <ScoreBar label="Growth" value={scores.growth} color={scores.growth >= 70 ? "bg-invest" : scores.growth >= 50 ? "bg-yellow-400" : "bg-pass"} />
                      <ScoreBar label="Risk" value={scores.risk} color={scores.risk >= 70 ? "bg-invest" : scores.risk >= 50 ? "bg-yellow-400" : "bg-pass"} />
                      <ScoreBar label="News" value={scores.news} color={scores.news >= 70 ? "bg-invest" : scores.news >= 50 ? "bg-yellow-400" : "bg-pass"} />
                      <ScoreBar label="Sentiment" value={scores.sentiment} color={scores.sentiment >= 70 ? "bg-invest" : scores.sentiment >= 50 ? "bg-yellow-400" : "bg-pass"} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── BULL / BEAR ── */}
            {((bull && bull.length > 0) || (bear && bear.length > 0)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bull && bull.length > 0 && (
                  <Card className="bg-invest/5 border-invest/20">
                    <CardHeader className="pb-3 border-b border-invest/20">
                      <CardTitle className="text-xs font-mono text-invest tracking-widest flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5" /> BULL CASE
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      {bull.map((point, idx) => (
                        <div key={idx} className="flex gap-3 items-start">
                          <div className="mt-1 h-5 w-5 rounded-full bg-invest/20 flex items-center justify-center shrink-0">
                            <TrendingUp className="h-3 w-3 text-invest" />
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">{point}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {bear && bear.length > 0 && (
                  <Card className="bg-pass/5 border-pass/20">
                    <CardHeader className="pb-3 border-b border-pass/20">
                      <CardTitle className="text-xs font-mono text-pass tracking-widest flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5" /> BEAR CASE
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      {bear.map((point, idx) => (
                        <div key={idx} className="flex gap-3 items-start">
                          <div className="mt-1 h-5 w-5 rounded-full bg-pass/20 flex items-center justify-center shrink-0">
                            <TrendingDown className="h-3 w-3 text-pass" />
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">{point}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── NEWS ── */}
            {news && news.length > 0 && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest flex items-center gap-2">
                    <Newspaper className="h-3.5 w-3.5" /> LATEST NEWS &amp; SIGNALS
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-2">
                  {news.map((item, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${
                      item.sentiment === "positive" ? "border-invest/20 bg-invest/5" :
                      item.sentiment === "negative" ? "border-pass/20 bg-pass/5" :
                      "border-border/30 bg-secondary/20"
                    }`}>
                      <span className="text-lg shrink-0 mt-0.5">
                        {item.sentiment === "positive" ? "🟢" : item.sentiment === "negative" ? "🔴" : "⚪"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 leading-snug">{item.headline}</p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1 uppercase">{item.sentiment}</p>
                      </div>
                      {item.url && item.url !== "" && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white transition-colors shrink-0 mt-0.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── CONFIDENCE BREAKDOWN ── */}
            {confidenceBreakdown && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest">
                    WHY CONFIDENCE IS {research.confidence}/10
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: "Financial Data", key: "financialData" },
                      { label: "News Quality", key: "newsQuality" },
                      { label: "Analyst Consensus", key: "analystConsensus" },
                      { label: "Market Sentiment", key: "marketSentiment" },
                    ].map(({ label, key }) => (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30">
                        <span className="text-sm text-gray-300">{label}</span>
                        <Stars count={(confidenceBreakdown as Record<string, number>)[key] ?? 0} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── SOURCES ── */}
            {research.sources && research.sources.length > 0 && (
              <Card className="bg-card/60 border-border/60">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" /> INTELLIGENCE SOURCES ({research.sources.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {research.sources.map((source, idx) => {
                      let domain = source;
                      try { domain = new URL(source).hostname.replace("www.", ""); } catch { /* ignore */ }
                      return (
                        <a key={idx} href={source} target="_blank" rel="noreferrer"
                          className="group flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/20 hover:bg-secondary/50 hover:border-border/80 transition-all">
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight className="h-3.5 w-3.5 text-primary/50 shrink-0" />
                            <span className="text-sm font-mono text-muted-foreground group-hover:text-white truncate transition-colors">{domain}</span>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── HOW THE AI WORKS ── */}
            <Card className="bg-card/40 border-border/40">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-xs font-mono text-muted-foreground tracking-widest">HOW THIS ANALYSIS WAS GENERATED</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
                  {["Your Query", "LangGraph Agent", "Tavily Web Search", "GPT-4o Reasoning", "Score Weighting", "Investment Verdict"].map((step, idx, arr) => (
                    <span key={step} className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-secondary/60 border border-border/40 text-gray-300">{step}</span>
                      {idx < arr.length - 1 && <span className="text-primary/50">→</span>}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  This analysis was generated by a LangGraph ReAct agent that ran {research.sources?.length ?? 0} live web searches via Tavily, extracted structured financial data, and applied GPT-4o reasoning to produce the investment thesis above. Always conduct your own due diligence.
                </p>
              </CardContent>
            </Card>

            {/* CTA */}
            <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${isInvest ? "border-invest/30 bg-invest/5" : "border-pass/30 bg-pass/5"}`}>
              <div className="flex-1">
                <p className="text-xs font-mono text-muted-foreground tracking-wider mb-1">ANALYST NOTE</p>
                <p className="text-sm text-gray-300">
                  {isInvest ? "Positive investment signals detected. Always verify with additional research before making decisions." : "Caution signals detected. Consider the bear case carefully before investing."}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0 font-mono text-xs">
                <Link href="/">NEW RESEARCH ↗</Link>
              </Button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
