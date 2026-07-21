/**
 * RepoChat — Repository Q&A panel powered by /api/v1/chat/repository SSE.
 *
 * Responsibilities:
 *   - Fetch available ChromaDB collections from GET /collections
 *   - Render a repo picker dropdown + chat input
 *   - Stream responses via SSE, parsing `event: context` and `event: token`
 *   - Render AI messages with react-markdown (GFM + syntax highlighting)
 *   - Show a collapsible "Sources" accordion beneath each assistant turn
 */

import * as React from "react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  LibraryBig,
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Database,
  FileCode2,
  RefreshCw,
  RotateCcw,
  Copy,
  Check,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";
import { getIdToken } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextChunk {
  file_path: string;
  chunk_index: number;
  distance: number;
  document: string;
}

export interface RepoMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  sources?: ContextChunk[];
  isStreaming?: boolean;
  timestamp: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://buglens-core-3d8d2493.onrender.com";

const MODELS = [
  { id: "gemini", label: "Gemini 2.5", badge: "Google" },
  { id: "openai", label: "GPT-4o", badge: "OpenAI" },
  { id: "claude", label: "Claude 3.5", badge: "Anthropic" },
];

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
}

function MarkdownContent({ content, isStreaming }: MarkdownProps) {
  return (
    <div className="repo-markdown prose-sm min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Fenced code blocks — full syntax highlighting
          code({ className, children, ...props }) {
            const isInline = !className;
            const match = /language-(\w+)/.exec(className ?? "");
            const lang = match?.[1] ?? "text";

            if (isInline) {
              return (
                <code
                  className="mx-0.5 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-primary"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="my-3 overflow-hidden rounded-lg border border-border/60">
                <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {lang}
                  </span>
                  <CopyButton text={String(children).replace(/\n$/, "")} />
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={lang}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    fontSize: "12.5px",
                    background: "oklch(0.16 0.018 285)",
                    padding: "14px 16px",
                  }}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              </div>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
          },
          // Headings
          h1({ children }) {
            return (
              <h1 className="mb-2 mt-4 text-base font-semibold text-foreground first:mt-0">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-1 mt-2 text-sm font-medium text-foreground first:mt-0">
                {children}
              </h3>
            );
          },
          // Lists
          ul({ children }) {
            return (
              <ul className="mb-2 ml-4 list-disc space-y-0.5 text-sm">{children}</ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-sm">{children}</ol>
            );
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },
          // Tables (GFM)
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted/40">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-3 py-1.5 text-left font-semibold text-foreground">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-t border-border/40 px-3 py-1.5 text-muted-foreground">
                {children}
              </td>
            );
          },
          // Horizontal rule
          hr() {
            return <hr className="my-3 border-border/50" />;
          },
          // Strong / em
          strong({ children }) {
            return (
              <strong className="font-semibold text-foreground">{children}</strong>
            );
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/70 align-middle" />
      )}
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Copy code"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Sources accordion ────────────────────────────────────────────────────────

function SourcesAccordion({ sources }: { sources: ContextChunk[] }) {
  const [open, setOpen] = useState(false);

  if (!sources.length) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Database className="size-3 text-primary/60" />
        {sources.length} source{sources.length !== 1 ? "s" : ""} retrieved
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5 pl-2">
          {sources.map((chunk, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/50 bg-card/30 px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <FileCode2 className="size-3 shrink-0 text-primary/60" />
                <span className="font-mono text-[11px] text-foreground/80 truncate">
                  {chunk.file_path}
                </span>
                <span className="ml-auto shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  sim {(1 - chunk.distance).toFixed(2)}
                </span>
              </div>
              <pre className="mt-1.5 max-h-24 overflow-y-auto rounded bg-[#1a1b26] p-2 font-mono text-[10px] text-muted-foreground leading-relaxed scrollbar-thin">
                {chunk.document.slice(0, 300)}
                {chunk.document.length > 300 ? "…" : ""}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single chat bubble ───────────────────────────────────────────────────────

function RepoChatBubble({ msg }: { msg: RepoMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2">
          <div className="rounded-2xl rounded-tr-sm bg-primary/15 px-4 py-2.5 ring-1 ring-primary/20">
            <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
          </div>
          <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted ring-1 ring-border">
            <User className="size-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-destructive/15 ring-1 ring-destructive/30">
          <AlertCircle className="size-3.5 text-destructive" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
          <p className="text-sm text-destructive">{msg.content}</p>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="group flex items-start gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-card/60 px-4 py-3 ring-1 ring-border/60">
          <MarkdownContent content={msg.content} isStreaming={msg.isStreaming} />
        </div>

        {/* Sources accordion (below the bubble) */}
        {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
          <SourcesAccordion sources={msg.sources} />
        )}

        {/* Copy button */}
        {!msg.isStreaming && (
          <button
            onClick={handleCopy}
            className="mt-1 flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="size-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3" /> Copy
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Repo selector dropdown ───────────────────────────────────────────────────

interface RepoSelectorProps {
  collections: string[];
  isLoading: boolean;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}

function RepoSelector({
  collections,
  isLoading,
  value,
  onChange,
  onRefresh,
}: RepoSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayValue = value || "Select a repository…";
  const isEmpty = collections.length === 0 && !isLoading;

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        id="repo-selector-btn"
        onClick={() => setOpen((p) => !p)}
        disabled={isLoading}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-card focus:outline-none",
          value
            ? "border-primary/30 text-foreground"
            : "border-border/60 text-muted-foreground",
          open && "border-primary/50 ring-1 ring-primary/20"
        )}
      >
        <Database className={cn("size-4 shrink-0", value ? "text-primary" : "text-muted-foreground/60")} />
        <span className="flex-1 truncate text-sm">
          {isLoading ? "Loading repositories…" : displayValue}
        </span>
        {isLoading ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-border bg-popover/98 py-1 shadow-2xl backdrop-blur-sm">
          {isEmpty ? (
            <div className="px-4 py-6 text-center">
              <Database className="mx-auto mb-2 size-8 text-muted-foreground/30" />
              <p className="text-xs font-medium text-muted-foreground">No repositories ingested</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                Run <code className="font-mono text-primary/70">python ingest.py</code> to index a repo
              </p>
            </div>
          ) : (
            collections.map((col) => (
              <button
                key={col}
                onClick={() => {
                  onChange(col);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
                  col === value ? "text-primary font-medium bg-accent/30" : "text-muted-foreground"
                )}
              >
                <Database className="size-3.5 shrink-0 text-primary/50" />
                <span className="truncate">{col}</span>
              </button>
            ))
          )}
          <div className="border-t border-border/50 px-2 py-1.5">
            <button
              onClick={() => { onRefresh(); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              Refresh list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function RepoChatEmptyState({
  hasRepo,
  onSelect,
}: {
  hasRepo: boolean;
  onSelect: (q: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="relative">
        <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <LibraryBig className="size-7 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-primary/20 ring-1 ring-primary/40">
          <Sparkles className="size-2.5 text-primary" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">Repository Q&A</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-52">
          {hasRepo
            ? "Ask anything about the selected codebase. The AI will search the indexed code to answer."
            : "Select an ingested repository above, then ask any question about it."}
        </p>
      </div>
      {hasRepo && (
        <div className="mt-1 grid gap-2 w-full max-w-xs">
          {[
            "How does authentication work?",
            "What does the LLM factory do?",
            "Explain the RAG pipeline",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSelect(q)}
              className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-left transition-colors hover:bg-card/80 hover:border-primary/30 cursor-pointer"
            >
              <p className="text-xs text-muted-foreground">{q}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Model picker (inline) ────────────────────────────────────────────────────

function InlineModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            "rounded-md px-2 py-1 text-[10px] font-mono font-medium transition-colors",
            value === m.id
              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── useRepoChat hook ─────────────────────────────────────────────────────────

function useRepoChat(repoName: string, model: string) {
  const [messages, setMessages] = useState<RepoMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || !repoName || isStreaming) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: RepoMessage = {
        id: uid(),
        role: "user",
        content: query,
        timestamp: new Date(),
      };

      const assistantId = uid();
      const assistantMsg: RepoMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        isStreaming: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      try {
        const token = await getIdToken();
        const res = await fetch(`${BACKEND_URL}/api/v1/chat/repository`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            repo_name: repoName,
            query,
            preferred_model: model,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Server responded ${res.status}: ${await res.text()}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");

        let buffer = "";
        let pendingSources: ContextChunk[] | null = null;

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

            if (eventType === "context") {
              try {
                pendingSources = JSON.parse(dataLine) as ContextChunk[];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, sources: pendingSources ?? [] }
                      : m
                  )
                );
              } catch {
                /* ignore parse errors */
              }
            } else if (eventType === "token") {
              // The backend serialises each token with json.dumps(), so we
              // use JSON.parse() here to correctly decode all escape sequences
              // (newlines, backslashes, unicode, etc.) without any data loss.
              let token: string;
              try {
                token = JSON.parse(dataLine) as string;
              } catch {
                // Fallback: treat as a plain string if somehow not valid JSON
                token = dataLine;
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + token }
                    : m
                )
              );
            } else if (eventType === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        role: "error" as const,
                        content: dataLine || "An unknown error occurred.",
                        isStreaming: false,
                      }
                    : m
                )
              );
            } else if (eventType === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                )
              );
            }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return;
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  role: "error" as const,
                  content: `Connection failed: ${errMsg}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [repoName, model, isStreaming]
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              content: m.content + "\n\n*[Stopped by user]*",
              isStreaming: false,
            }
          : m
      )
    );
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, stopStream, clearMessages };
}

// ─── Main exported component ──────────────────────────────────────────────────

interface RepoChatPanelProps {
  /** Whether this panel is the currently active tab (for auto-focus) */
  isActive: boolean;
}

export function RepoChatPanel({ isActive }: RepoChatPanelProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>(() => {
    return typeof localStorage !== "undefined"
      ? (localStorage.getItem("buglens_repo_name") ?? "")
      : "";
  });
  const [model, setModel] = useState("gemini");
  const [inputValue, setInputValue] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isStreaming, sendMessage, stopStream, clearMessages } =
    useRepoChat(selectedRepo, model);

  // ── Persist repo selection
  useEffect(() => {
    if (selectedRepo)
      localStorage.setItem("buglens_repo_name", selectedRepo);
  }, [selectedRepo]);

  // ── Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Focus input when tab becomes active
  useEffect(() => {
    if (isActive) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isActive]);

  // ── Fetch ChromaDB collections
  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/collections`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections ?? []);
        // Auto-select first collection if nothing is selected
        if (!selectedRepo && data.collections?.length) {
          setSelectedRepo(data.collections[0]);
        }
      }
    } catch {
      /* backend offline — silently ignore */
    } finally {
      setCollectionsLoading(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    fetchCollections();
  }, []);

  // ── Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [inputValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = inputValue.trim();
    if (!q || !selectedRepo || isStreaming) return;
    setInputValue("");
    sendMessage(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = !!inputValue.trim() && !!selectedRepo && !isStreaming;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: repo selector ──────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <RepoSelector
            collections={collections}
            isLoading={collectionsLoading}
            value={selectedRepo}
            onChange={setSelectedRepo}
            onRefresh={fetchCollections}
          />
          {messages.length > 0 && (
            <button
              id="repo-clear-chat-btn"
              onClick={clearMessages}
              title="Clear conversation"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <RepoChatEmptyState
            hasRepo={!!selectedRepo}
            onSelect={(q) => {
              // Directly submit the suggested question
              sendMessage(q);
            }}
          />
        ) : (
          messages.map((msg) => <RepoChatBubble key={msg.id} msg={msg} />)
        )}
        {isStreaming && (
          <div className="flex items-center gap-2 px-1">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="text-[11px] text-muted-foreground animate-pulse">
              Searching codebase and generating answer…
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Input area ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-card/10 p-3">
        {/* Model picker row */}
        <div className="mb-2 flex items-center justify-between px-1">
          <InlineModelPicker value={model} onChange={setModel} />
          <span className="text-[10px] text-muted-foreground/40 font-mono">
            {selectedRepo || "no repo selected"}
          </span>
        </div>

        {/* Input + send */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div
            className={cn(
              "flex flex-1 items-end rounded-xl border bg-card/60 px-3 py-2 transition-colors",
              selectedRepo && !isStreaming
                ? "border-border/60 hover:border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"
                : "border-border/30 opacity-60"
            )}
          >
            <textarea
              ref={textareaRef}
              id="repo-chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !selectedRepo
                  ? "Select a repository to begin…"
                  : "Ask anything about the codebase… (Enter to send)"
              }
              disabled={!selectedRepo || isStreaming}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed"
              style={{ maxHeight: "120px" }}
            />
          </div>

          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={stopStream}
              className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <X className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!canSend}
              id="repo-send-btn"
              className="shrink-0 gap-1.5 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              <Send className="size-4" />
            </Button>
          )}
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Shift+Enter for newline · Enter to send
        </p>
      </div>
    </div>
  );
}
