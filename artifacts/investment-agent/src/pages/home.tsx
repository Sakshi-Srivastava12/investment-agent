import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Search, Loader2, ArrowRight, TrendingUp, TrendingDown, Target, Zap } from "lucide-react";
import { 
  useListResearch, 
  useStartResearch, 
  useGetResearchStats 
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [company, setCompany] = useState("");
  const [, setLocation] = useLocation();
  
  const { data: stats, isLoading: statsLoading } = useGetResearchStats();
  const { data: history, isLoading: historyLoading } = useListResearch();
  
  const startResearch = useStartResearch();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;

    startResearch.mutate({ data: { company: company.trim() } }, {
      onSuccess: (job) => {
        setLocation(`/research/${job.id}`);
      }
    });
  };

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8 space-y-12 animate-in fade-in duration-500">
      
      {/* Hero / Search Section */}
      <section className="flex flex-col items-center justify-center space-y-6 pt-12 pb-8">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white">
            Target Acquisition <span className="text-muted-foreground">Matrix</span>
          </h1>
          <p className="text-muted-foreground font-mono text-sm max-w-2xl mx-auto">
            ENTER A PUBLIC COMPANY TICKER OR NAME TO GENERATE AN INVESTMENT THESIS
          </p>
        </div>

        <form onSubmit={handleSearch} className="w-full max-w-2xl relative mt-4">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Palantir, AAPL, SpaceX..."
              className="h-16 w-full pl-12 pr-32 text-lg bg-card/50 border-2 border-border focus-visible:ring-0 focus-visible:border-primary rounded-xl font-mono shadow-2xl"
              disabled={startResearch.isPending}
              data-testid="input-company-search"
            />
            <div className="absolute right-2">
              <Button 
                type="submit" 
                size="lg"
                disabled={!company.trim() || startResearch.isPending}
                className="h-12 px-6 rounded-lg font-mono font-bold tracking-wider"
                data-testid="button-submit-search"
              >
                {startResearch.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>GENERATE THESIS <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Total Processed" 
          value={stats?.total ?? "-"} 
          icon={<Target className="h-4 w-4" />} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Invest Signals" 
          value={stats?.invest ?? "-"} 
          icon={<TrendingUp className="h-4 w-4 text-invest" />} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Pass Signals" 
          value={stats?.pass ?? "-"} 
          icon={<TrendingDown className="h-4 w-4 text-pass" />} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Avg Confidence" 
          value={stats?.avgConfidence ? `${stats.avgConfidence.toFixed(1)}/10` : "-"} 
          icon={<Zap className="h-4 w-4 text-yellow-500" />} 
          loading={statsLoading} 
        />
      </section>

      {/* Recent History */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-xl font-medium text-white tracking-tight">Recent Intelligence</h2>
          <span className="text-xs font-mono text-muted-foreground">LIVE FEED</span>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/20">
            <p className="text-muted-foreground font-mono text-sm">NO INTELLIGENCE LOGS FOUND.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {history.map((job) => (
              <Link 
                key={job.id} 
                href={`/research/${job.id}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card/30 hover:bg-card/80 transition-colors"
                data-testid={`link-history-${job.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <h3 className="font-semibold text-lg text-white group-hover:text-primary transition-colors">
                      {job.company}
                    </h3>
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      <span>ID: {job.id.toString().padStart(4, '0')}</span>
                      <span>•</span>
                      <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 sm:mt-0">
                  {job.status === "completed" ? (
                    <>
                      {job.confidence && (
                        <div className="text-right">
                          <div className="text-xs font-mono text-muted-foreground">CONFIDENCE</div>
                          <div className="font-mono font-bold">{job.confidence}/10</div>
                        </div>
                      )}
                      <Badge 
                        variant="outline" 
                        className={`font-mono text-xs uppercase px-3 py-1 ${
                          job.verdict === 'invest' ? 'text-invest border-invest/30 bg-invest/10' : 
                          job.verdict === 'pass' ? 'text-pass border-pass/30 bg-pass/10' :
                          job.verdict === 'unknown' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : ''
                        }`}
                      >
                        {job.verdict === 'unknown' ? 'NOT FOUND' : job.verdict || '—'}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline" className="font-mono text-xs uppercase text-muted-foreground animate-pulse">
                      {job.status}
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-white transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function StatCard({ title, value, icon, loading }: { title: string, value: string | number, icon: React.ReactNode, loading: boolean }) {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-xs font-mono text-muted-foreground font-medium uppercase">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl md:text-3xl font-bold font-mono text-white tracking-tight">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
