import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/AuthGuard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Bug,
  GitCommit,
  GitPullRequest,
  Timer,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  WifiOff,
  CalendarDays,
  BarChart3,
  CheckCircle2,
  XCircle,
  Layers,
  ShieldAlert,
  Zap,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/hooks/useDashboardData";
import type { RecentReview } from "@/lib/api";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Tooltip,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · BugLens" },
      {
        name: "description",
        content: "Your code quality metrics and recent AI reviews.",
      },
    ],
  }),
  component: () => (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSeverityBadge(severity: string) {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical")
    return (
      <Badge className="bg-red-500/10 text-red-400 border-red-500/25 shadow-none font-medium">
        Critical
      </Badge>
    );
  if (s === "high")
    return (
      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/25 shadow-none font-medium">
        High
      </Badge>
    );
  if (s === "medium")
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/25 shadow-none font-medium">
        Medium
      </Badge>
    );
  if (s === "low")
    return (
      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/25 shadow-none font-medium">
        Low
      </Badge>
    );
  return (
    <Badge className="bg-muted/60 text-muted-foreground border-border shadow-none font-medium capitalize">
      {severity || "Info"}
    </Badge>
  );
}

function getStatusBadge(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s === "failed")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
        <XCircle className="size-3.5" />
        Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      Completed
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted/30 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Animated number (counts up on mount)
// ---------------------------------------------------------------------------
function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const [displayed, setDisplayed] = React.useState(0);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (value === 0) { setDisplayed(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * value));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <>{displayed.toLocaleString()}</>;
}

// ---------------------------------------------------------------------------
// Premium Stat Card
// ---------------------------------------------------------------------------
interface StatCardProps {
  id: string;
  label: string;
  value: number | string;
  isNumeric?: boolean;
  trend?: string;
  TrendIcon?: React.ElementType;
  Icon: React.ElementType;
  trendColor?: string;
  accentClass: string;          // gradient + glow colour token
  iconBgClass: string;
  borderClass: string;
}

function StatCard({
  id,
  label,
  value,
  isNumeric = true,
  trend,
  TrendIcon,
  Icon,
  trendColor = "text-emerald-400",
  accentClass,
  iconBgClass,
  borderClass,
}: StatCardProps) {
  return (
    <div
      id={id}
      className={`group relative overflow-hidden rounded-2xl border ${borderClass} bg-card/50 backdrop-blur-sm p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}
    >
      {/* Background glow */}
      <div
        className={`absolute -right-6 -top-6 size-28 rounded-full ${accentClass} opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.14]`}
      />

      {/* Top row */}
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <div className={`grid size-9 place-items-center rounded-xl ${iconBgClass} ring-1 ring-white/5`}>
          <Icon className="size-4" />
        </div>
      </div>

      {/* Value */}
      <div className="mt-3">
        <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
          {isNumeric && typeof value === "number" ? (
            <AnimatedNumber value={value} />
          ) : (
            value
          )}
        </p>
      </div>

      {/* Trend */}
      {trend && TrendIcon && (
        <p className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
          <TrendIcon className="size-3" />
          {trend}
        </p>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <TableRow className="hover:bg-transparent border-border/40">
      <TableCell><Skeleton className="h-3 w-28" /></TableCell>
      <TableCell><Skeleton className="h-3 w-40" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-3 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Severity breakdown bar chart
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG = [
  { key: "critical", label: "Critical", color: "#f87171" },
  { key: "high",     label: "High",     color: "#fb923c" },
  { key: "medium",   label: "Medium",   color: "#facc15" },
  { key: "low",      label: "Low",      color: "#60a5fa" },
  { key: "info",     label: "Info",     color: "#94a3b8" },
] as const;

interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

function SeverityChart({ breakdown }: { breakdown: SeverityBreakdown }) {
  const data = SEVERITY_CONFIG.map((cfg) => ({
    name: cfg.label,
    count: breakdown[cfg.key],
    color: cfg.color,
  })).filter((d) => d.count > 0);

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
        <BarChart3 className="size-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground/60 italic">
          No reviews yet — run your first code review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Horizontal stacked bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
        {SEVERITY_CONFIG.map((cfg) => {
          const pct = total > 0 ? (breakdown[cfg.key] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={cfg.key}
              title={`${cfg.label}: ${breakdown[cfg.key]}`}
              style={{ width: `${pct}%`, backgroundColor: cfg.color }}
              className="transition-all duration-700 first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>

      {/* Legend + counts */}
      <div className="space-y-2.5">
        {SEVERITY_CONFIG.map((cfg) => {
          const count = breakdown[cfg.key];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={cfg.key} className="flex items-center gap-2.5">
              <div
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="flex-1 text-xs text-muted-foreground">{cfg.label}</span>
              <div className="flex items-center gap-2">
                {/* mini bar */}
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[11px] font-medium text-foreground/70">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-right text-[11px] text-muted-foreground/50 font-mono">
        {total} total reviews
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------
function DashboardPage() {
  const { stats, recentReviews, isLoading, isError, error, refetch } =
    useDashboardData();

  const statCards: StatCardProps[] = stats
    ? [
        {
          id: "stat-monthly-reviews",
          label: "Reviews This Month",
          value: stats.monthly_reviews_count,
          isNumeric: true,
          trend: `${stats.total_reviews_count.toLocaleString()} all-time`,
          TrendIcon: TrendingUp,
          Icon: CalendarDays,
          trendColor: "text-emerald-400",
          accentClass: "bg-violet-500",
          iconBgClass: "bg-violet-500/15 text-violet-400",
          borderClass: "border-violet-500/15",
        },
        {
          id: "stat-critical-bugs",
          label: "Critical Bugs Caught",
          value: stats.critical_bugs_caught,
          isNumeric: true,
          trend:
            stats.critical_bugs_caught > 0
              ? "Needs immediate attention"
              : "All clear — no critical issues",
          TrendIcon: stats.critical_bugs_caught > 0 ? AlertTriangle : TrendingDown,
          Icon: Bug,
          trendColor:
            stats.critical_bugs_caught > 0 ? "text-red-400" : "text-emerald-400",
          accentClass: "bg-red-500",
          iconBgClass: "bg-red-500/15 text-red-400",
          borderClass: "border-red-500/15",
        },
        {
          id: "stat-response-time",
          label: "Avg Response Time",
          value:
            stats.average_response_time > 0
              ? `${stats.average_response_time}s`
              : "N/A",
          isNumeric: false,
          trend:
            stats.average_response_time > 0
              ? "Mean AI latency"
              : "No timing data yet",
          TrendIcon: Timer,
          Icon: Timer,
          trendColor: "text-sky-400",
          accentClass: "bg-sky-500",
          iconBgClass: "bg-sky-500/15 text-sky-400",
          borderClass: "border-sky-500/15",
        },
        {
          id: "stat-total-reviews",
          label: "Total Reviews",
          value: stats.total_reviews_count,
          isNumeric: true,
          trend: "OpenAI · Claude · Gemini",
          TrendIcon: TrendingUp,
          Icon: GitPullRequest,
          trendColor: "text-emerald-400",
          accentClass: "bg-emerald-500",
          iconBgClass: "bg-emerald-500/15 text-emerald-400",
          borderClass: "border-emerald-500/15",
        },
      ]
    : [];

  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Dashboard" }]}>
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8 animate-in fade-in duration-500">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Real-time overview of your code-quality metrics and AI review history.
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
            <RefreshCw
              className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {isError && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <WifiOff className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-destructive">
                Failed to load dashboard data
              </p>
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

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))
            : statCards.map((card) => <StatCard key={card.id} {...card} />)}
        </div>

        {/* ── Main content grid ────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Recent Reviews Table — spans 2/3 */}
          <Card className="lg:col-span-2 bg-card/40 backdrop-blur-sm border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Reviews</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    The 5 most recent AI-analyzed code reviews from MongoDB.
                  </CardDescription>
                </div>
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Layers className="size-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="text-xs text-muted-foreground">
                        Repository
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        File
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Severity
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Language
                      </TableHead>
                      <TableHead className="text-xs text-muted-foreground">
                        Model
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRowSkeleton key={i} />
                      ))}

                    {!isLoading &&
                      !isError &&
                      (recentReviews?.length ?? 0) === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-36 text-center text-muted-foreground text-sm"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <GitPullRequest className="size-8 text-muted-foreground/25" />
                              <p className="italic">
                                No reviews yet. Run your first code review in the
                                Workspace.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                    {!isLoading &&
                      recentReviews?.map((review: RecentReview) => (
                        <TableRow
                          key={review.id}
                          id={`review-row-${review.id}`}
                          className="group border-border/40 hover:bg-muted/20 transition-colors"
                        >
                          {/* Repository */}
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 min-w-0">
                              <GitCommit className="size-3.5 shrink-0 text-muted-foreground/50" />
                              <span
                                className="truncate max-w-[130px] text-sm"
                                title={review.repository_name}
                              >
                                {review.repository_name}
                              </span>
                            </div>
                          </TableCell>

                          {/* File */}
                          <TableCell className="max-w-[160px]">
                            <span
                              className="block truncate font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground group-hover:border-border/70 transition-colors"
                              title={review.file_name}
                            >
                              {review.file_name}
                            </span>
                          </TableCell>

                          {/* Severity */}
                          <TableCell>
                            {getSeverityBadge(review.severity_level)}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            {getStatusBadge(review.status)}
                          </TableCell>

                          {/* Language */}
                          <TableCell>
                            <span className="font-mono text-[11px] capitalize text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
                              {review.language}
                            </span>
                          </TableCell>

                          {/* Model */}
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

          {/* Severity Breakdown — spans 1/3 */}
          <Card className="bg-card/40 backdrop-blur-sm border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-lg bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
                  <ShieldAlert className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Severity Breakdown</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Distribution across all your reviews.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Skeleton className="size-2.5 rounded-full shrink-0" />
                      <Skeleton className="h-2.5 flex-1" />
                      <Skeleton className="h-2.5 w-6" />
                    </div>
                  ))}
                </div>
              ) : stats?.severity_breakdown ? (
                <SeverityChart breakdown={stats.severity_breakdown} />
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-2">
                  <Info className="size-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground/60 italic">
                    Connect backend to see data.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Quick-action hint strips ───────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/30 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Zap className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Ready to review code?
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste a snippet in the Workspace.
                </p>
              </div>
            </div>
            <Button
              id="goto-workspace-btn"
              size="sm"
              variant="outline"
              className="gap-2 text-xs shrink-0"
              onClick={() => window.location.assign("/workspace")}
            >
              Open Workspace
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/30 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <GitPullRequest className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Automate GitHub PRs
                </p>
                <p className="text-xs text-muted-foreground">
                  Set up a Webhook to review PRs automatically.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-xs shrink-0"
              onClick={() => window.location.assign("/settings")}
            >
              Configure
            </Button>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
