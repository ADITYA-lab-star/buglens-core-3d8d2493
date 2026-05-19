import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, GitCommit, ShieldAlert, Activity, Plus, GitBranch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { currentUser, recentActivity, repositories } from "@/lib/dummy-data";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · BugLens" },
      { name: "description", content: "Your repositories, recent reviews, and activity." },
    ],
  }),
  component: DashboardPage,
});

const severityStyles: Record<string, string> = {
  info: "text-muted-foreground bg-muted/60",
  warn: "text-yellow-400 bg-yellow-400/10",
  critical: "text-destructive bg-destructive/15",
};

const stats = [
  { label: "Open findings", value: "18", trend: "+3 today", icon: ShieldAlert },
  { label: "PRs reviewed", value: "124", trend: "this month", icon: GitCommit },
  { label: "Avg review time", value: "9.4s", trend: "-1.2s vs last wk", icon: Activity },
  { label: "Active repos", value: "4", trend: "of 5 connected", icon: GitBranch },
];

function DashboardPage() {
  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Dashboard" }]}>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Welcome back, {currentUser.name}.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You have <span className="text-foreground font-medium">3 reviews</span> waiting across your repositories.
            </p>
          </div>
          <Link to="/workspace">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-1 size-4" />
              New review
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card/40 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className="size-3.5 text-muted-foreground" />
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">{s.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.trend}</p>
            </div>
          ))}
        </div>

        {/* Two-column */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Repos */}
          <section className="rounded-lg border border-border bg-card/30">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Repositories</h2>
              <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View all <ArrowUpRight className="size-3" />
              </button>
            </div>
            <ul className="divide-y divide-border">
              {repositories.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-3.5 text-primary" />
                      <span className="font-mono text-sm font-medium">{r.name}</span>
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.language}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{r.stack}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="font-mono text-sm font-medium text-foreground">{r.issues}</p>
                      <p className="text-[10px] text-muted-foreground">findings</p>
                    </div>
                    <span className="hidden sm:inline text-[11px] text-muted-foreground w-16">{r.lastReview}</span>
                    <Link to="/workspace">
                      <Button size="sm" variant="outline" className="border-border">Review</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Activity */}
          <section className="rounded-lg border border-border bg-card/30">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                live
              </span>
            </div>
            <ol className="px-5 py-2">
              {recentActivity.map((a, i) => (
                <li key={i} className="relative flex gap-3 py-3">
                  <div className="flex flex-col items-center">
                    <span className={`grid size-6 place-items-center rounded-full ${severityStyles[a.severity]}`}>
                      <GitCommit className="size-3" />
                    </span>
                    {i < recentActivity.length - 1 && <span className="mt-1 flex-1 w-px bg-border" />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <p className="truncate text-sm text-foreground">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{a.repo}</span> · {a.author} · {a.time}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
