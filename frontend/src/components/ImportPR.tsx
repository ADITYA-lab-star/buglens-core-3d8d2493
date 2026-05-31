import * as React from "react";
import { useState } from "react";
import { GitPullRequest, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/context/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://buglens-core-3d8d2493.onrender.com";

interface ImportPRProps {
  model: string;
  onStartAnalysis: (prUrl: string) => void;
  onAnalysisComplete: (data: any, prUrl: string) => void;
  onError: (error: string) => void;
}

export function ImportPR({ model, onStartAnalysis, onAnalysisComplete, onError }: ImportPRProps) {
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim() || loading) return;

    setLoading(true);
    onStartAnalysis(prUrl.trim());

    try {
      const token = await getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/reviews/analyze/pr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pr_url: prUrl.trim(),
          preferred_model: model,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail ?? `Server returned status ${res.status}`);
      }

      const data = await res.json();
      onAnalysisComplete(data, prUrl.trim());
      setPrUrl(""); // clear input on success
    } catch (err: any) {
      console.error("PR analysis failed:", err);
      onError(err.message ?? "An error occurred while fetching/analyzing the PR.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <GitPullRequest className="size-4 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Import GitHub Pull Request
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id="pr-url-input"
          type="url"
          placeholder="Paste GitHub PR URL (e.g. https://github.com/owner/repo/pull/123)..."
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={loading}
          className="flex-1 border-border/60 bg-background/50 text-sm focus-visible:ring-primary/40 focus-visible:ring-1"
        />
        <Button
          id="analyze-pr-btn"
          type="submit"
          disabled={!prUrl.trim() || loading}
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10 transition-all duration-200"
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Analyzing
            </>
          ) : (
            <>
              <Play className="size-3.5" />
              Analyze PR
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
