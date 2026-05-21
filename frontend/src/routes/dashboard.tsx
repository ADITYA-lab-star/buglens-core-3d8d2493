import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Bug, GitCommit, GitPullRequest, Timer, FileCode,
  AlertTriangle, TrendingUp, TrendingDown, RefreshCw, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/hooks/useDashboardData";
import type { RecentReview } from "@/lib/api";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · BugLens" },
      { name: "description", content: "Your code quality metrics and recent AI reviews." },
    ],
  }),
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Static insights panel (no backend endpoint yet)
// ---------------------------------------------------------------------------
const insights = [
  {
    title: "Missing input validation",
    count: 24,
    description: "Unsanitized user inputs detected in API routes leading to potential injection vectors.",
  },
  {
    title: "Unnecessary React re-renders",
    count: 18,
    description: "Missing memoization on heavy component props in deeply nested trees.",
  },
  {
    title: "Hardcoded secrets",
    count: 5,
    description: "API keys and database credentials found in frontend application code.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSeverityBadge(severity: string) {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical")
    return <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-none border-red-500/20">Critical</Badge>;
  if (s === "high")
    return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/20">High</Badge>;
  if (s === "medium")
    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20">Medium</Badge>;
  if (s === "low")
    return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">Low</Badge>;
  return <Badge variant="outline" className="capitalize">{severity || "Info"}</Badge>;
}

/** A single pulsing skeleton bar. */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/40 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Stat card: live data variant
// ---------------------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  TrendIcon?: React.ElementType;
  Icon: React.ElementType;
  trendColor?: string;
}

function StatCard({ label, value, trend, TrendIcon, Icon, trendColor = "text-emerald-500" }: StatCardProps) {
  return (
    <Card className="bg-card/40 backdrop-blur-sm border-border shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {trend && TrendIcon && (
          <p className={`text-xs mt-1 flex items-center ${trendColor}`}>
            <TrendIcon className="mr-1 size-3" />
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Skeleton placeholder for a stat card while loading. */
function StatCardSkeleton() {
  return (
    <Card className="bg-card/40 backdrop-blur-sm border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="size-4 rounded-sm" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

/** Skeleton row for the recent reviews table. */
function TableRowSkeleton() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell><Skeleton className="h-3 w-32" /></TableCell>
      <TableCell><Skeleton className="h-3 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-3 w-12 ml-auto" /></TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------
function DashboardPage() {
  const { stats, recentReviews, isLoading, isError, error, refetch } = useDashboardData();

  // Derive stat cards from live API data
  const statCards: StatCardProps[] = stats
    ? [
        {
          label: "Reviews Completed",
          value: stats.total_reviews_count.toLocaleString(),
          trend: "Live count from database",
          TrendIcon: TrendingUp,
          Icon: GitPullRequest,
          trendColor: "text-emerald-500",
        },
        {
          label: "Critical Bugs Found",
          value: stats.critical_bugs_caught.toLocaleString(),
          trend: "Severity = critical",
          TrendIcon: TrendingDown,
          Icon: Bug,
          trendColor: stats.critical_bugs_caught > 0 ? "text-red-400" : "text-emerald-500",
        },
        {
          label: "Avg Response Time",
          value: `${stats.average_response_time}s`,
          trend: "Mocked · timing col pending",
          TrendIcon: TrendingDown,
          Icon: Timer,
          trendColor: "text-emerald-500",
        },
        {
          label: "Models Available",
          value: "3",
          trend: "OpenAI · Claude · Gemini",
          TrendIcon: TrendingUp,
          Icon: FileCode,
          trendColor: "text-sky-400",
        },
      ]
    : [];

  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Dashboard" }]}>
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Overview of your code quality metrics and recent AI reviews.
            </p>
          </div>
          <Button
            id="dashboard-refetch-btn"
            size="sm"
            variant="outline"
            onClick={refetch}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Error banner */}
        {isError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <WifiOff className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-destructive">Failed to load dashboard data</p>
              <p className="text-muted-foreground mt-0.5 break-words">
                {error?.message ?? "Unknown error"}
              </p>
              <p className="text-muted-foreground/60 mt-1 text-xs">
                Make sure the backend is running at{" "}
                <code className="font-mono">localhost:8000</code>.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={refetch}
              className="h-7 text-xs shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            : statCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Recent Reviews Table */}
          <Card className="lg:col-span-2 bg-card/40 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle>Recent Reviews</CardTitle>
              <CardDescription>
                The 5 most recent AI-analyzed code reviews from the database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[200px]">Repository</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Model</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
                    )}

                    {!isLoading && !isError && (recentReviews?.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-10 italic">
                          No reviews yet. Run your first code review in the Workspace.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && recentReviews?.map((review: RecentReview) => (
                      <TableRow
                        key={review.id}
                        className="group hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <GitCommit className="size-3.5 text-muted-foreground" />
                            <span className="truncate max-w-[150px]" title={review.repository_name}>
                              {review.repository_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className="font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 group-hover:border-border transition-colors truncate max-w-[180px] block"
                            title={review.file_name}
                          >
                            {review.file_name}
                          </span>
                        </TableCell>
                        <TableCell>{getSeverityBadge(review.severity_level)}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground capitalize">
                            {review.ai_model_used}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights Panel — static, no backend endpoint yet */}
          <Card className="bg-card/40 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-500 border border-orange-500/20">
                  <AlertTriangle className="size-4" />
                </div>
                <CardTitle className="text-lg">Security Risk Trends</CardTitle>
              </div>
              <CardDescription>
                Most common issues found in your repositories over the last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {insights.map((insight, index) => (
                  <div
                    key={index}
                    className="flex flex-col space-y-2 relative pl-4 before:absolute before:left-0 before:top-1.5 before:bottom-0 before:w-[2px] before:bg-primary/20 hover:before:bg-primary transition-colors"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <span className="font-semibold text-sm leading-none">{insight.title}</span>
                      <span className="text-[10px] font-mono bg-muted/60 text-muted-foreground px-2 py-0.5 rounded border border-border/50">
                        {insight.count} instances
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppShell>
  );
}
