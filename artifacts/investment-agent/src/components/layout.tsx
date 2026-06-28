import { ReactNode } from "react";
import { Link } from "wouter";
import { Terminal, Activity } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2 mr-6 text-foreground hover:text-primary transition-colors">
            <Terminal className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold tracking-tight text-sm uppercase flex items-center gap-2">
              <span className="text-white">Apex</span>
              <span className="text-muted-foreground">Intel</span>
            </span>
          </Link>
          
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <nav className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground px-3 py-1 rounded-full bg-secondary/50 border border-border">
                <Activity className="h-3 w-3 text-invest animate-pulse" />
                <span>SYSTEM ONLINE</span>
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
