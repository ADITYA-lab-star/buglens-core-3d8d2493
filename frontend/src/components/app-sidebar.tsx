import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, GitPullRequest, FolderGit2, BarChart3, Settings, Bug } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Reviews", url: "/workspace", icon: GitPullRequest },
  { title: "Repositories", url: "/repositories", icon: FolderGit2 },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 px-5 border-b border-sidebar-border">
        <div className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
          <Bug className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">BugLens</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">v0.1 · beta</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 pb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Workspace
        </p>
        {items.map((item) => {
          const active = pathname === item.url;
          return (
            <Link
              key={item.title}
              to={item.url}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-lg border border-sidebar-border bg-card/40 p-3">
        <p className="text-xs font-medium text-foreground">Free plan</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          120 / 500 reviews used this month
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[24%] rounded-full bg-primary" />
        </div>
      </div>
    </aside>
  );
}
