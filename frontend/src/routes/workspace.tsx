import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Play,
  Loader2,
  Sparkles,
  Upload,
  Copy,
  Check,
  RotateCcw,
  Bot,
  Code2,
  ChevronDown,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Lightbulb,
  X,
  FileCode,
  LibraryBig,
  MessageSquare,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RepoChatPanel } from "@/components/RepoChat";
import { getIdToken } from "@/context/AuthContext";
import { ImportPR } from "@/components/ImportPR";

// ─── Route config ────────────────────────────────────────────────────────────
export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace · BugLens" },
      {
        name: "description",
        content:
          "Real-time AI code review. Paste a snippet, hit Run Review, and watch BugLens stream back insights.",
      },
    ],
  }),
  component: () => (
    <AuthGuard>
      <WorkspacePage />
    </AuthGuard>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  timestamp: Date;
}

type Language = {
  id: string;
  label: string;
  ext: string;
};

const LANGUAGES: Language[] = [
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "python", label: "Python", ext: "py" },
  { id: "java", label: "Java", ext: "java" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "go", label: "Go", ext: "go" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "csharp", label: "C#", ext: "cs" },
];

const MODELS = [
  { id: "openai", label: "GPT-4o", badge: "OpenAI" },
  { id: "claude", label: "Claude 3.5", badge: "Anthropic" },
  { id: "gemini", label: "Gemini 2.5", badge: "Google" },
];

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://buglens-core-3d8d2493.onrender.com";

// ─── CodeEditor ───────────────────────────────────────────────────────────────
function CodeEditor({
  value,
  onChange,
  language,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      try {
        const { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } =
          await import("@codemirror/view");
        const { EditorState } = await import("@codemirror/state");
        const { defaultKeymap, historyKeymap, history } = await import(
          "@codemirror/commands"
        );
        const { oneDark } = await import("@codemirror/theme-one-dark");
        const { syntaxHighlighting, defaultHighlightStyle, bracketMatching } = await import(
          "@codemirror/language"
        );

        // Lazy-load the right language extension
        let langExt = null;
        try {
          if (["javascript", "typescript", "jsx", "tsx"].includes(language)) {
            const { javascript } = await import("@codemirror/lang-javascript");
            langExt = javascript({ typescript: language === "typescript" });
          } else if (language === "python") {
            const { python } = await import("@codemirror/lang-python");
            langExt = python();
          } else if (language === "java") {
            const { java } = await import("@codemirror/lang-java");
            langExt = java();
          } else if (language === "rust") {
            const { rust } = await import("@codemirror/lang-rust");
            langExt = rust();
          } else if (language === "css") {
            const { css } = await import("@codemirror/lang-css");
            langExt = css();
          } else if (language === "html") {
            const { html } = await import("@codemirror/lang-html");
            langExt = html();
          }
        } catch {
          // language extension not installed, continue without it
        }

        if (destroyed || !editorRef.current) return;

        const extensions = [
          oneDark,
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "13px",
              backgroundColor: "transparent",
            },
            ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
            ".cm-content": { paddingBottom: "80px" },
            ".cm-focused": { outline: "none" },
          }),
        ];

        if (langExt) extensions.push(langExt);

        const state = EditorState.create({ doc: value, extensions });
        const view = new EditorView({ state, parent: editorRef.current });
        viewRef.current = view;
        if (!destroyed) setEditorReady(true);
      } catch {
        // CodeMirror not yet installed — show textarea fallback
        if (!destroyed) setEditorReady(false);
      }
    }

    init();

    return () => {
      destroyed = true;
      if (viewRef.current) {
        (viewRef.current as { destroy(): void }).destroy();
        viewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Sync external value changes into the editor (e.g. file upload)
  useEffect(() => {
    if (!viewRef.current) return;
    const view = viewRef.current as {
      state: { doc: { toString(): string } };
      dispatch: (t: unknown) => void;
    };
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  if (!editorReady) {
    // Graceful fallback — plain textarea with mono font
    return (
      <textarea
        id="code-editor-textarea"
        className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        placeholder={`// Paste your code here…\nfunction hello() {\n  return "world";\n}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
      />
    );
  }

  return <div ref={editorRef} className="h-full w-full overflow-hidden" />;
}

// ─── Markdown-ish renderer ───────────────────────────────────────────────────
// Lightweight renderer — no heavy deps, handles **bold**, `code`, ## headings,
// bullet points, and horizontal rules that AI typically emits.
function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="workspace-markdown space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (/^#{1,3}\s/.test(line)) {
          const text = line.replace(/^#+\s/, "");
          return (
            <p key={i} className="font-semibold text-foreground mt-3 mb-1">
              {renderInline(text)}
            </p>
          );
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{renderInline(line.replace(/^[-*]\s/, ""))}</span>
            </div>
          );
        }
        if (/^---+$/.test(line.trim())) {
          return <hr key={i} className="border-border my-2" />;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on `code`, **bold**, or *italic*
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="mx-0.5 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/15 px-4 py-2.5 ring-1 ring-primary/20">
          <p className="text-sm text-foreground">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-card/60 px-4 py-3 ring-1 ring-border/60">
          <MarkdownMessage content={msg.content} />
          {msg.isStreaming && (
            <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/70" />
          )}
        </div>
        {!msg.isStreaming && (
          <button
            onClick={handleCopy}
            className="mt-1 flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            aria-label="Copy response"
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

// ─── Language selector ────────────────────────────────────────────────────────
function LanguageSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.id === value) ?? LANGUAGES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        id="language-selector-btn"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <FileCode className="size-3.5" />
        {current.label}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-popover/95 py-1 shadow-xl backdrop-blur-sm">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => {
                onChange(lang.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                lang.id === value ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              <span className="font-mono text-[10px] text-muted-foreground/60 w-6">
                .{lang.ext}
              </span>
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Model selector ───────────────────────────────────────────────────────────
function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        id="model-selector-btn"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <Sparkles className="size-3.5 text-primary/70" />
        {current.label}
        <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-mono text-primary">
          {current.badge}
        </span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-popover/95 py-1 shadow-xl backdrop-blur-sm">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                model.id === value ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {model.label}
              <span className="rounded bg-muted/60 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                {model.badge}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ level }: { level: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    critical: {
      color: "text-red-400 bg-red-500/10 ring-red-500/20",
      icon: <AlertTriangle className="size-3" />,
      label: "Critical",
    },
    high: {
      color: "text-orange-400 bg-orange-500/10 ring-orange-500/20",
      icon: <ShieldAlert className="size-3" />,
      label: "High",
    },
    medium: {
      color: "text-yellow-400 bg-yellow-500/10 ring-yellow-500/20",
      icon: <Zap className="size-3" />,
      label: "Medium",
    },
    low: {
      color: "text-green-400 bg-green-500/10 ring-green-500/20",
      icon: <Lightbulb className="size-3" />,
      label: "Low",
    },
    info: {
      color: "text-blue-400 bg-blue-500/10 ring-blue-500/20",
      icon: <Sparkles className="size-3" />,
      label: "Info",
    },
  };
  const cfg = map[level?.toLowerCase()] ?? map.info;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
        cfg.color
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Empty state for chat ─────────────────────────────────────────────────────
function EmptyChatState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="relative">
        <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Bot className="size-7 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-green-500/20 ring-1 ring-green-500/40">
          <div className="size-2 rounded-full bg-green-400 animate-pulse" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">AI Assistant Ready</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-48">
          Paste your code on the left and hit{" "}
          <span className="text-primary font-medium">Run Review</span> to get real-time
          AI-powered insights.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-xs mt-2">
        {[
          { icon: <ShieldAlert className="size-3.5" />, text: "Security vulnerabilities" },
          { icon: <Zap className="size-3.5" />, text: "Performance bottlenecks" },
          { icon: <Lightbulb className="size-3.5" />, text: "Clean code suggestions" },
        ].map(({ icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
          >
            <span className="text-primary/70">{icon}</span>
            <span className="text-xs text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main WorkspacePage ───────────────────────────────────────────────────────
function WorkspacePage() {
  const [code, setCode] = useState(() => localStorage.getItem("workspace_code") || "");
  const [language, setLanguage] = useState(() => localStorage.getItem("workspace_lang") || "javascript");
  const [model, setModel] = useState(() => localStorage.getItem("workspace_model") || "gemini");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("workspace_messages");
      if (saved) {
        return JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [isReviewing, setIsReviewing] = useState(false);
  const [severity, setSeverity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<0 | 1>(() => {
    return Number(localStorage.getItem("workspace_tab")) === 1 ? 1 : 0;
  });

  // Persist state
  useEffect(() => localStorage.setItem("workspace_code", code), [code]);
  useEffect(() => localStorage.setItem("workspace_lang", language), [language]);
  useEffect(() => localStorage.setItem("workspace_model", model), [model]);
  useEffect(() => localStorage.setItem("workspace_messages", JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem("workspace_tab", String(activeTab)), [activeTab]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Detect language from extension
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const detectedLang =
      LANGUAGES.find((l) => l.ext === ext)?.id ?? language;
    setLanguage(detectedLang);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCode(ev.target?.result as string);
    };
    reader.readAsText(file);
    // reset so same file can be re-uploaded
    e.target.value = "";
  };

  const handleClearCode = () => {
    setCode("");
    setMessages([]);
    setSeverity(null);
  };

  const formatReviewToMarkdown = (data: any) => {
    let md = `### AI Code Review Report\n\n`;
    md += `**Severity Verdict**: ${data.severity_level?.toUpperCase() ?? "INFO"}\n\n`;
    
    if (data.security_issues && data.security_issues.length > 0) {
      md += `#### 🛡️ Security Issues\n`;
      data.security_issues.forEach((issue: string) => {
        md += `* ${issue}\n`;
      });
      md += `\n`;
    } else {
      md += `#### 🛡️ Security Issues\n* ✅ No security vulnerabilities identified.\n\n`;
    }
    
    if (data.bugs && data.bugs.length > 0) {
      md += `#### 🐛 Bugs & Logical Errors\n`;
      data.bugs.forEach((bug: string) => {
        md += `* ${bug}\n`;
      });
      md += `\n`;
    } else {
      md += `#### 🐛 Bugs & Logical Errors\n* ✅ No logical bugs detected.\n\n`;
    }
    
    if (data.performance_tips && data.performance_tips.length > 0) {
      md += `#### ⚡ Performance Bottlenecks\n`;
      data.performance_tips.forEach((tip: string) => {
        md += `* ${tip}\n`;
      });
      md += `\n`;
    } else {
      md += `#### ⚡ Performance Bottlenecks\n* ✅ Code is optimized for execution.\n\n`;
    }
    
    if (data.clean_code_suggestions && data.clean_code_suggestions.length > 0) {
      md += `#### 💡 Maintainability & Refactoring\n`;
      data.clean_code_suggestions.forEach((suggestion: string) => {
        md += `* ${suggestion}\n`;
      });
      md += `\n`;
    } else {
      md += `#### 💡 Maintainability & Refactoring\n* ✅ Code conforms to clean standards.\n\n`;
    }
    
    return md;
  };

  const handlePRStart = (prUrl: string) => {
    setIsReviewing(true);
    setSeverity(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `🔍 Import and analyze GitHub PR: ${prUrl}`,
        timestamp: new Date(),
      },
      {
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: new Date(),
      },
    ]);
  };

  const handlePRComplete = (data: any, prUrl: string) => {
    const mdContent = formatReviewToMarkdown(data);
    setSeverity(data.severity_level);
    setIsReviewing(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          content: mdContent,
          isStreaming: false,
        };
      }
      return updated;
    });
  };

  const handlePRError = (errorMsg: string) => {
    setIsReviewing(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          content: `⚠️ **PR Import failed:** ${errorMsg}\n\nMake sure the PR is public and you have configured your \`GITHUB_ACCESS_TOKEN\` in the backend environment.`,
          isStreaming: false,
        };
      }
      return updated;
    });
  };

  const handleRunReview = useCallback(async () => {
    if (!code.trim() || isReviewing) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsReviewing(true);
    setSeverity(null);

    // Add user "trigger" message
    const userMsg: ChatMessage = {
      role: "user",
      content: `Review my ${LANGUAGES.find((l) => l.id === language)?.label ?? language} code snippet (${code.split("\n").length} lines)`,
      timestamp: new Date(),
    };

    // Placeholder assistant message for streaming
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const token = await getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/analyze/snippet`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          code,
          language,
          preferred_model: model,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server responded ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: done")) {
            // Stream complete — mark message as done
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, isStreaming: false };
              }
              return updated;
            });
          } else if (line.startsWith("event: error")) {
            // Will be caught by next data line
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            if (!raw.trim()) continue;

            // Unescape the newlines we escaped server-side
            const token = raw.replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + token,
                };
              }
              return updated;
            });
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;

      const errMsg =
        err instanceof Error ? err.message : "An unknown error occurred.";

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: `⚠️ **Review failed:** ${errMsg}\n\nMake sure the backend is running at \`${BACKEND_URL}\`.`,
            isStreaming: false,
          };
        }
        return updated;
      });
    } finally {
      setIsReviewing(false);
    }
  }, [code, language, model, isReviewing]);

  const handleStopStream = () => {
    abortRef.current?.abort();
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          content: last.content + "\n\n*[Review stopped by user]*",
          isStreaming: false,
        };
      }
      return updated;
    });
    setIsReviewing(false);
  };

  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Workspace" }]}>
      <div
        id="workspace-root"
        className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background"
      >
        {/* ── LEFT PANE: Code Editor ─────────────────────────────────────── */}
        <div className="flex w-[55%] shrink-0 flex-col border-r border-border">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-card/30 px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Code Editor
              </span>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelector value={language} onChange={setLanguage} />
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".js,.ts,.jsx,.tsx,.py,.java,.rs,.go,.css,.html,.cpp,.cs,.rb,.php,.swift"
                onChange={handleFileUpload}
                id="file-upload-input"
              />
              <button
                id="upload-file-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload a file"
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <Upload className="size-3.5" />
                Upload
              </button>
              {code && (
                <button
                  id="clear-code-btn"
                  onClick={handleClearCode}
                  title="Clear editor"
                  className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* CodeMirror editor area */}
          <div className="relative flex-1 overflow-hidden bg-[#1a1b26]">
            <CodeEditor value={code} onChange={setCode} language={language} />
            {!code && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Code2 className="size-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground/40">
                    Paste code or upload a file to begin
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Editor footer — Run Review CTA */}
          <div className="shrink-0 border-t border-border bg-card/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ModelSelector value={model} onChange={setModel} />
                {severity && <SeverityBadge level={severity} />}
                <span className="text-[11px] text-muted-foreground/50 font-mono">
                  {code.split("\n").length} lines · {code.length} chars
                </span>
              </div>

              {isReviewing ? (
                <Button
                  id="stop-review-btn"
                  size="sm"
                  variant="outline"
                  onClick={handleStopStream}
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <X className="size-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  id="run-review-btn"
                  size="sm"
                  onClick={handleRunReview}
                  disabled={!code.trim()}
                  className="gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 transition-all duration-200"
                >
                  <Play className="size-4" />
                  Run Review
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANE: Tabbed AI Panel ────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex shrink-0 items-center gap-0 border-b border-border bg-card/30 px-2">
            <button
              id="tab-code-review"
              onClick={() => setActiveTab(0)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
                activeTab === 0
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <MessageSquare className="size-3.5" />
              Code Review
            </button>
            <button
              id="tab-repo-qa"
              onClick={() => setActiveTab(1)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
                activeTab === 1
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <LibraryBig className="size-3.5" />
              Repository Q&amp;A
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                RAG
              </span>
            </button>

            {/* Spacer + live status indicator (Tab 0 only) */}
            <div className="ml-auto flex items-center gap-2 pr-3">
              {activeTab === 0 && (
                <>
                  <div className="relative">
                    <div className="grid size-5 place-items-center rounded-full bg-primary/15 ring-1 ring-primary/25">
                      <Bot className="size-3 text-primary" />
                    </div>
                    {isReviewing && (
                      <div className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-400 ring-1 ring-card animate-pulse" />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {isReviewing ? "Reviewing…" : "AI Ready"}
                  </span>
                  {messages.length > 0 && (
                    <button
                      id="clear-chat-btn"
                      onClick={() => { setMessages([]); setSeverity(null); }}
                      title="Clear chat"
                      className="flex items-center gap-1 rounded-md border border-border/60 bg-card/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <RotateCcw className="size-3" />
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tab 0: Code Review chat */}
          <div className={cn("flex-1 min-h-0 flex-col", activeTab === 0 ? "flex" : "hidden")}>
            <div className="px-4 pt-4 shrink-0">
              <ImportPR
                model={model}
                onStartAnalysis={handlePRStart}
                onAnalysisComplete={handlePRComplete}
                onError={handlePRError}
              />
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scrollbar-thin scrollbar-thumb-border/50">
              {messages.length === 0 ? (
                <EmptyChatState />
              ) : (
                messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)
              )}
              {isReviewing && messages.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                  <Loader2 className="size-3.5 text-primary animate-spin" />
                  <span className="text-[11px] text-muted-foreground animate-pulse">
                    BugLens is analyzing your code…
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border bg-card/20 px-4 py-2.5">
              <p className="text-center text-[11px] text-muted-foreground/50">
                Review results stream in real-time via SSE ·{" "}
                <span className="text-primary/50">
                  {MODELS.find((m) => m.id === model)?.label}
                </span>
              </p>
            </div>
          </div>

          {/* Tab 1: Repository Q&A */}
          <div className={cn("flex-1 min-h-0", activeTab === 1 ? "flex flex-col" : "hidden")}>
            <RepoChatPanel isActive={activeTab === 1} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
