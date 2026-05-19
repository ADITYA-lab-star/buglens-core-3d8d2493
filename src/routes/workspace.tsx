import { createFileRoute } from "@tanstack/react-router";
import { Bug, ShieldAlert, Info, AlertTriangle, GitBranch, Play, FileCode } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { reviewComments, sampleCode } from "@/lib/dummy-data";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace · BugLens" },
      { name: "description", content: "Review code with AI-powered inline analysis." },
    ],
  }),
  component: WorkspacePage,
});

const severityIcon = {
  info: Info,
  warn: AlertTriangle,
  critical: ShieldAlert,
} as const;

const severityTone: Record<string, string> = {
  info: "text-sky-400 border-sky-400/30 bg-sky-400/5",
  warn: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  critical: "text-destructive border-destructive/40 bg-destructive/5",
};

function WorkspacePage() {
  const lines = sampleCode.split("\n");

  return (
    <AppShell
      crumbs={[
        { label: "BugLens", to: "/" },
        { label: "HuntBoard", to: "/dashboard" },
        { label: "useJobBoard.ts" },
      ]}
    >
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* Workspace toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card/30 px-6 py-2.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-muted-foreground">
              <GitBranch className="size-3" /> feat/job-board-hook
            </span>
            <span className="font-mono text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
              <FileCode className="size-3" /> src/hooks/useJobBoard.ts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-border">Apply all fixes</Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Play className="mr-1 size-3.5" /> Re-run review
            </Button>
          </div>
        </div>

        {/* Split panes */}
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1.5fr_1fr]">
          {/* Code */}
          <div className="min-h-0 overflow-auto border-r border-border bg-background">
            <table className="w-full font-mono text-[13px] leading-6">
              <tbody>
                {lines.map((line, i) => {
                  const lineNum = i + 1;
                  const flagged = reviewComments.find((c) => c.line === lineNum);
                  return (
                    <tr
                      key={i}
                      className={
                        flagged
                          ? `border-l-2 ${severityTone[flagged.severity]} border-l-current`
                          : "border-l-2 border-l-transparent"
                      }
                    >
                      <td className="select-none whitespace-nowrap py-0 pl-4 pr-4 text-right font-mono text-[11px] text-muted-foreground/60 align-top w-[3rem]">
                        {lineNum}
                      </td>
                      <td className="whitespace-pre py-0 pr-6 text-foreground/90">
                        {line || " "}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* AI review */}
          <aside className="min-h-0 overflow-auto bg-card/20">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/60 px-5 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <div className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
                  <Bug className="size-3.5" />
                </div>
                <h2 className="text-sm font-semibold">AI Review</h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {reviewComments.length} findings
              </span>
            </div>

            <div className="space-y-3 p-4">
              {reviewComments.map((c, i) => {
                const Icon = severityIcon[c.severity];
                return (
                  <article
                    key={i}
                    className={`rounded-lg border ${severityTone[c.severity]} p-4`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5" />
                        <span className="font-mono text-[10px] uppercase tracking-widest">
                          {c.severity}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          · line {c.line}
                        </span>
                      </div>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-foreground">{c.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.body}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 border-border text-xs">
                        Suggest patch
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">
                        Dismiss
                      </Button>
                    </div>
                  </article>
                );
              })}

              <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Ask BugLens a question about this file
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-2 text-left">
                  <span className="font-mono text-xs text-muted-foreground">›</span>
                  <input
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                    placeholder="Why does loading get stuck?"
                  />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
