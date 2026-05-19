import { Link } from "@tanstack/react-router";
import { Moon, Sun, ChevronRight, Search } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/dummy-data";

export function TopNavbar({ crumbs }: { crumbs: { label: string; to?: string }[] }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <div key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" />}
              {c.to && !last ? (
                <Link to={c.to} className="text-muted-foreground hover:text-foreground transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span className={last ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {c.label}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground w-72">
          <Search className="size-3.5" />
          <span>Search repos, reviews…</span>
          <kbd className="ml-auto rounded bg-background px-1.5 py-0.5 text-[10px] font-mono border border-border">⌘K</kbd>
        </div>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 py-1 pl-1 pr-3">
          <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-[11px] font-semibold text-primary-foreground">
            {currentUser.initials}
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-medium text-foreground">{currentUser.name}</span>
            <span className="text-[10px] text-muted-foreground">{currentUser.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
