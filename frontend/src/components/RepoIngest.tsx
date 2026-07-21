/**
 * RepoIngest — GitHub repository ingestion panel.
 *
 * Responsibilities:
 *   - Accept a GitHub repo URL + optional custom name
 *   - POST to /api/v1/chat/ingest-github and consume the SSE stream
 *   - Show real-time progress (fetch phase → embed phase)
 *   - Report success (chunk count) or error
 *   - Notify parent to refresh the collections list on success
 */

import * as React from "react";
import { useState, useRef, useCallback } from "react";
import {
  Github,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  FileCode2,
  Cpu,
  Download,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getIdToken } from "@/context/AuthContext";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "https://buglens-core-3d8d2493.onrender.com";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "fetching_tree"
  | "fetching_files"
  | "chunking"
  | "embedding"
  | "done"
  | "error";

interface ProgressState {
  phase: Phase;
  message: string;
  fetched: number;
  total: number;
  currentFile: string;
  chunksUpserted: number;
  filesIndexed: number;
  errorMessage: string;
}

const initialProgress: ProgressState = {
  phase: "idle",
  message: "",
  fetched: 0,
  total: 0,
  currentFile: "",
  chunksUpserted: 0,
  filesIndexed: 0,
  errorMessage: "",
};

// ─── Phase labels ─────────────────────────────────────────────────────────────

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "fetching_tree":  return "Scanning repository…";
    case "fetching_files": return "Downloading source files…";
    case "chunking":       return "Splitting into chunks…";
    case "embedding":      return "Embedding with Gemini…";
    case "done":           return "Indexing complete!";
    case "error":          return "Ingestion failed";
    default:               return "";
  }
}

function phaseIcon(phase: Phase) {
  switch (phase) {
    case "fetching_tree":
    case "fetching_files":
      return <Download className="size-3.5 text-primary animate-bounce" />;
    case "chunking":
      return <FileCode2 className="size-3.5 text-primary animate-pulse" />;
    case "embedding":
      return <Cpu className="size-3.5 text-primary animate-spin" />;
    case "done":
      return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case "error":
      return <XCircle className="size-3.5 text-destructive" />;
    default:
      return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RepoIngestProps {
  /** Called after a successful ingest so the parent can refresh collections. */
  onSuccess: (repoName: string) => void;
  /** Allow parent to close the panel. */
  onClose: () => void;
}

export function RepoIngest({ onSuccess, onClose }: RepoIngestProps) {
  const [githubUrl, setGithubUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning =
    progress.phase !== "idle" &&
    progress.phase !== "done" &&
    progress.phase !== "error";

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setProgress(initialProgress);
    setGithubUrl("");
    setRepoName("");
  }, []);

  const handleIngest = useCallback(async () => {
    if (!githubUrl.trim() || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProgress({ ...initialProgress, phase: "fetching_tree", message: "Connecting…" });

    try {
      const token = await getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/ingest-github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          github_url: githubUrl.trim(),
          repo_name: repoName.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        setProgress((p) => ({
          ...p,
          phase: "error",
          errorMessage: text,
        }));
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body from server.");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          const lines = block.split("\n");
          let eventType = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6);
          }

          if (eventType === "progress") {
            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>;
              const phase = (data.phase as Phase) ?? "fetching_files";

              setProgress((prev) => ({
                ...prev,
                phase,
                message: (data.message as string) ?? phaseLabel(phase),
                fetched: (data.fetched as number) ?? (data.chunks_done as number) ?? prev.fetched,
                total:
                  (data.total as number) ??
                  (data.total_chunks as number) ??
                  (data.total_batches as number) ??
                  prev.total,
                currentFile: (data.file as string) ?? prev.currentFile,
              }));
            } catch {
              /* ignore parse errors */
            }
          } else if (eventType === "done") {
            try {
              const data = JSON.parse(dataLine) as {
                chunks_upserted?: number;
                repo_name?: string;
                files_indexed?: number;
              };
              const finalRepoName = data.repo_name ?? repoName.trim() || githubUrl;
              setProgress((prev) => ({
                ...prev,
                phase: "done",
                chunksUpserted: data.chunks_upserted ?? 0,
                filesIndexed: data.files_indexed ?? 0,
              }));
              onSuccess(finalRepoName);
            } catch {
              setProgress((prev) => ({ ...prev, phase: "done" }));
            }
          } else if (eventType === "error") {
            let errMsg = dataLine;
            try { errMsg = JSON.parse(dataLine) as string; } catch { /* raw */ }
            setProgress((prev) => ({
              ...prev,
              phase: "error",
              errorMessage: errMsg,
            }));
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setProgress((prev) => ({
        ...prev,
        phase: "error",
        errorMessage: msg,
      }));
    }
  }, [githubUrl, repoName, isRunning, onSuccess]);

  const progressPct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.fetched / progress.total) * 100))
      : 0;

  return (
    <div className="border-b border-border bg-card/30 px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Github className="size-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Index a Repository</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Input form (only shown when idle / after done/error) */}
      {(progress.phase === "idle" || progress.phase === "done" || progress.phase === "error") && (
        <div className="space-y-2">
          <input
            id="ingest-github-url"
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleIngest(); }}
            placeholder="https://github.com/owner/repo"
            className={cn(
              "w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm",
              "text-foreground placeholder:text-muted-foreground/40 focus:outline-none",
              "focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
            )}
          />
          <div className="flex items-center gap-2">
            <input
              id="ingest-repo-name"
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Custom name (optional)"
              className={cn(
                "flex-1 rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-sm",
                "text-foreground placeholder:text-muted-foreground/40 focus:outline-none",
                "focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              )}
            />
            <Button
              id="ingest-start-btn"
              type="button"
              size="sm"
              disabled={!githubUrl.trim()}
              onClick={progress.phase === "idle" ? handleIngest : reset}
              className={cn(
                "shrink-0 gap-1.5 shadow-sm transition-all",
                progress.phase === "idle"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                  : "border border-border/60 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-card"
              )}
            >
              {progress.phase === "idle" ? (
                <>
                  <Plus className="size-3.5" />
                  Index
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  New
                </>
              )}
            </Button>
          </div>

          {/* Success state */}
          {progress.phase === "done" && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              <div>
                <p className="text-xs font-medium text-emerald-400">Indexing complete</p>
                <p className="text-[11px] text-muted-foreground">
                  {progress.filesIndexed} file{progress.filesIndexed !== 1 ? "s" : ""} →{" "}
                  {progress.chunksUpserted} chunk{progress.chunksUpserted !== 1 ? "s" : ""} stored
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {progress.phase === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-destructive">Ingestion failed</p>
                <p className="text-[11px] text-muted-foreground break-words">
                  {progress.errorMessage || "An unknown error occurred."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Live progress (shown while running) */}
      {isRunning && (
        <div className="space-y-2">
          {/* Phase label */}
          <div className="flex items-center gap-1.5">
            {phaseIcon(progress.phase)}
            <span className="text-xs font-medium text-foreground">
              {phaseLabel(progress.phase)}
            </span>
          </div>

          {/* Progress bar */}
          {progress.total > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[70%]">
                  {progress.currentFile || progress.message}
                </p>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {progress.fetched}/{progress.total}
                </span>
              </div>
            </div>
          )}

          {/* No total yet — indeterminate */}
          {progress.total === 0 && (
            <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
            </div>
          )}

          {/* Cancel button */}
          <button
            onClick={() => {
              abortRef.current?.abort();
              setProgress(initialProgress);
            }}
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
