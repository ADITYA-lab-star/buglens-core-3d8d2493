import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle, Play, FileCode, ShieldAlert, Zap, Code2,
  Bot, Send, Sparkles, Loader2, WifiOff, FileText, X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
import { useReviewStream } from "@/hooks/useReviewStream";
import { useRagChat } from "@/hooks/useRagChat";
import type { ContextChunk } from "@/lib/api";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace · BugLens" },
      { name: "description", content: "Review code with AI-powered inline analysis." },
    ],
  }),
  component: WorkspacePage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REPO_NAME = "owner/my-repo"; // can be made dynamic via route params

const SAMPLE_CODE = `import React, { useState, useEffect } from 'react';

export function Dashboard() {
  const [data, setData] = useState(null);
  const API_KEY = "sk-live-12345abcdef67890"; // Exposed API Key

  useEffect(() => {
    fetch(\`https://api.example.com/data?key=\${API_KEY}\`)
      .then(res => res.json())
      .then(data => setData(data));

    // Missing cleanup function can cause memory leaks
  }, []);

  return (
    <div className="p-4">
      <h1>Dashboard</h1>
      {/* Inline arrow function in render */}
      <button onClick={() => console.log('Clicked!', data)}>
        Log Data
      </button>
    </div>
  );
}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  contextChunks?: ContextChunk[];
}

// ---------------------------------------------------------------------------
// Syntax-highlighted code line renderer
// ---------------------------------------------------------------------------
const CODE_LINES: React.ReactNode[] = SAMPLE_CODE.split("\n").map((raw, i) => {
  const colorized = raw
    .replace(/\b(import|export|function|const|return|from)\b/g, "<kw>$1</kw>")
    .replace(/(useState|useEffect|fetch|then|setData)/g, "<fn>$1</fn>")
    .replace(/(\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, "<str>$1</str>")
    .replace(/(\/\/[^\n]*)/g, "<cm>$1</cm>")
    .replace(/\b(null|true|false)\b/g, "<lit>$1</lit>");

  const parts: React.ReactNode[] = [];
  const tagMap: Record<string, string> = {
    kw: "text-purple-400", fn: "text-blue-300",
    str: "text-emerald-300", cm: "text-muted-foreground/50",
    lit: "text-orange-400",
  };

  const tagPattern = /<(kw|fn|str|cm|lit)>(.*?)<\/\1>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(colorized)) !== null) {
    if (match.index > lastIndex) parts.push(colorized.slice(lastIndex, match.index));
    parts.push(<span key={match.index} className={tagMap[match[1]]}>{match[2]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < colorized.length) parts.push(colorized.slice(lastIndex));
  return <>{parts}</>;
});

// ---------------------------------------------------------------------------
// WorkspacePage
// ---------------------------------------------------------------------------
function WorkspacePage() {
  // ── Shared model selector state (passed into both hook calls) ────────────
  const [selectedModel, setSelectedModel] = useState<string>("gemini");

  // ── Review hook ──────────────────────────────────────────────────────────
  const {
    streamedText: reviewText,
    isStreaming: reviewStreaming,
    error: reviewError,
    startStream,
    cancel: cancelReview,
    reset: resetReview,
  } = useReviewStream();

  const reviewStatus = reviewStreaming
    ? "streaming"
    : reviewError
    ? "error"
    : reviewText
    ? "done"
    : "idle";

  const runReview = () => {
    startStream({
      code: SAMPLE_CODE,
      language: "javascript",
      preferred_model: selectedModel,
      repository_name: REPO_NAME,
    });
  };

  const clearReview = () => resetReview();

  // ── Chat hook ────────────────────────────────────────────────────────────
  const {
    contextFiles,
    streamingAnswer,
    isStreaming: chatStreaming,
    error: chatError,
    ask,
    reset: resetChat,
  } = useRagChat();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const chatStatus: "idle" | "streaming" | "done" | "error" = chatStreaming
    ? "streaming"
    : chatError
    ? "error"
    : "idle";

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamingAnswer]);

  // Sync the live streamingAnswer into the last assistant message
  useEffect(() => {
    if (!chatStreaming && !streamingAnswer) return;
    setChatMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: streamingAnswer, contextChunks: contextFiles },
      ];
    });
  }, [streamingAnswer, contextFiles, chatStreaming]);

  const sendChatMessage = async () => {
    const query = chatInput.trim();
    if (!query || chatStreaming) return;

    setChatInput("");
    // Add user message
    setChatMessages((prev) => [...prev, { role: "user", content: query }]);
    // Add empty assistant placeholder immediately
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", contextChunks: [] },
    ]);

    await ask({
      repo_name: REPO_NAME,
      query,
      preferred_model: selectedModel,
    });
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Workspace" }]}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-[#0A0A0A]">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card/30 px-6 py-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md">
            <FileCode className="size-3.5" /> src/components/Dashboard.jsx
          </span>
          <div className="flex items-center gap-2">
            <Button
              id="workspace-clear-btn"
              size="sm"
              variant="outline"
              className="border-border"
              disabled={reviewStatus === "streaming"}
              onClick={clearReview}
            >
              Clear
            </Button>
            <Button
              id="workspace-run-review-btn"
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={runReview}
              disabled={reviewStatus === "streaming"}
            >
              {reviewStatus === "streaming"
                ? <><Loader2 className="mr-1 size-3.5 animate-spin" /> Reviewing…</>
                : <><Play className="mr-1 size-3.5" /> Run Review</>}
            </Button>
          </div>
        </div>

        {/* Resizable panels */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">

          {/* ── LEFT: Code Editor ─────────────────────────────────────────── */}
          <ResizablePanel defaultSize={50} minSize={30} className="relative bg-[#0D0D12] overflow-auto flex flex-col">
            <div className="font-mono text-[13px] leading-6 py-4 flex-1">
              {CODE_LINES.map((content, i) => {
                const lineNum = i + 1;
                const isWarningLine = lineNum === 12;
                return (
                  <React.Fragment key={i}>
                    <div className="group flex hover:bg-white/[0.02] transition-colors relative px-4">
                      <div className="select-none text-right w-8 pr-4 text-muted-foreground/40 shrink-0">{lineNum}</div>
                      <div className="flex-1 whitespace-pre">{content}</div>
                    </div>
                    {isWarningLine && (
                      <div className="my-3 mx-12 mr-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 relative animate-in fade-in zoom-in-95 duration-300 shadow-lg">
                        <div className="absolute -top-[5px] left-8 w-2.5 h-2.5 rotate-45 bg-[#171012] border-t border-l border-red-500/20" />
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-1 rounded-md bg-red-500/20 text-red-500 shrink-0">
                            <AlertTriangle className="size-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-red-400">Memory Leak Detected</h4>
                            <p className="mt-1 text-xs text-red-400/80 leading-relaxed max-w-xl">
                              Warning: Possible memory leak here. You are initiating a fetch request but not providing a
                              cleanup function in the{" "}
                              <code className="bg-black/30 px-1 rounded font-mono border border-red-500/20">useEffect</code>.
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button
                                id="fix-with-ai-btn"
                                size="sm"
                                onClick={runReview}
                                disabled={reviewStatus === "streaming"}
                                className="h-7 px-3 text-xs bg-red-500 hover:bg-red-600 text-white border-transparent"
                              >
                                <Sparkles className="size-3 mr-1.5" /> Fix with AI
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-[1px] bg-border hover:w-[2px] hover:bg-primary transition-all duration-200" />

          {/* ── RIGHT: AI Review + Chat ───────────────────────────────────── */}
          <ResizablePanel defaultSize={50} minSize={30} className="bg-card/20 flex flex-col min-h-0">

            {/* Header — model selector lives here, updates shared state */}
            <div className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3 backdrop-blur shrink-0">
              <div className="flex items-center gap-2">
                <div className="grid size-6 place-items-center rounded-md bg-primary/20 text-primary ring-1 ring-primary/30">
                  <Bot className="size-3.5" />
                </div>
                <h2 className="text-sm font-semibold">AI Assistant</h2>
                {reviewStatus === "streaming" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-primary">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                    </span>
                    Live
                  </span>
                )}
              </div>

              {/*
               * Model selector — `selectedModel` is shared state.
               * Changing it here updates the payload for BOTH runReview()
               * and sendChatMessage() automatically on next invocation.
               */}
              <Select
                value={selectedModel}
                onValueChange={(val) => setSelectedModel(val)}
              >
                <SelectTrigger
                  id="model-selector"
                  className="w-[170px] h-8 text-xs bg-background/50 backdrop-blur-sm border-border"
                >
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI GPT-4o</SelectItem>
                  <SelectItem value="claude">Claude 3.5 Sonnet</SelectItem>
                  <SelectItem value="gemini">Gemini 1.5 Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto min-h-0 flex flex-col">

              {/* ── Review Output ─────────────────────────────────────────── */}
              <div className="p-5 border-b border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="size-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Code Review
                  </span>
                </div>

                {reviewStatus === "idle" && (
                  <div className="text-xs text-muted-foreground/60 italic">
                    Click <span className="text-primary font-medium">Run Review</span> to analyse the
                    code with the selected model.
                  </div>
                )}

                {(reviewStatus === "streaming" || reviewStatus === "done") && (
                  <ReviewOutput text={reviewText} streaming={reviewStatus === "streaming"} />
                )}

                {reviewStatus === "error" && (
                  <ErrorBanner message={reviewError ?? "Unknown error"} onRetry={runReview} />
                )}
              </div>

              {/* ── Chat Messages ─────────────────────────────────────────── */}
              <div className="flex-1 p-5 space-y-5 overflow-auto">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 italic text-center mt-4">
                    Ask anything about this repository…
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <ChatBubble
                    key={i}
                    message={msg}
                    streaming={
                      chatStatus === "streaming" &&
                      i === chatMessages.length - 1 &&
                      msg.role === "assistant"
                    }
                  />
                ))}
                {chatStatus === "error" && (
                  <ErrorBanner
                    message={chatError ?? "Unknown error"}
                    onRetry={sendChatMessage}
                  />
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>

            {/* ── Chat Input ─────────────────────────────────────────────── */}
            <div className="p-4 border-t border-border bg-card/40 shrink-0 backdrop-blur">
              <div className="relative flex items-center bg-background rounded-md shadow-sm border border-border overflow-hidden focus-within:ring-1 focus-within:ring-primary transition-all">
                <Input
                  id="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a question about this repository…"
                  className="pr-10 border-none shadow-none focus-visible:ring-0 text-sm h-10 bg-transparent"
                  disabled={chatStreaming}
                />
                <Button
                  id="chat-send-btn"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 size-8 hover:bg-transparent"
                  onClick={sendChatMessage}
                  disabled={chatStreaming || !chatInput.trim()}
                >
                  {chatStreaming
                    ? <Loader2 className="size-4 animate-spin text-primary" />
                    : <Send className="size-4 text-muted-foreground hover:text-primary transition-colors" />}
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground/40 font-mono pl-1">
                RAG · {REPO_NAME} · {selectedModel}
              </p>
            </div>

          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Live streaming view or structured accordion when complete. */
function ReviewOutput({ text, streaming }: { text: string; streaming: boolean }) {
  if (streaming) {
    return (
      <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono text-[12px] bg-muted/20 rounded-lg p-4 border border-border/50 min-h-[60px]">
        {text}
        <span className="inline-block w-[2px] h-[13px] bg-primary ml-0.5 animate-pulse align-middle" />
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full space-y-2" defaultValue="review">
      <AccordionItem
        value="review"
        className="border border-primary/20 bg-primary/5 rounded-lg px-4 border-b-0 overflow-hidden"
      >
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="size-4 text-primary" />
            <span className="font-medium text-primary/90">Review Complete</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-muted-foreground pt-1 pb-4 leading-relaxed whitespace-pre-wrap font-mono text-[12px]">
          {text || <span className="italic opacity-50">No output received.</span>}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * Chat bubble with context-file badges rendered above assistant messages.
 * The `contextChunks` come from the `event: context` SSE event via useRagChat.
 */
function ChatBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-primary border border-primary/20 mt-0.5">
          <Bot className="size-3.5" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>

        {/* Context citation badges — only on assistant messages that have context */}
        {!isUser && (message.contextChunks?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.contextChunks!.map((c, i) => (
              <span
                key={i}
                title={`${c.file_path} · chunk ${c.chunk_index} · distance ${c.distance.toFixed(3)}`}
                className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full border border-border/50 cursor-default"
              >
                <FileText className="size-2.5" />
                {c.file_path.split("/").pop()}
                <span className="opacity-50">·{i + 1}</span>
              </span>
            ))}
          </div>
        )}

        {/* Bubble body */}
        <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border/60 text-foreground/90"
        }`}>
          {message.content
            ? <span className="whitespace-pre-wrap">{message.content}</span>
            : <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                <Loader2 className="size-3 animate-spin" /> Thinking…
              </span>}
          {streaming && message.content && (
            <span className="inline-block w-[2px] h-[13px] bg-primary ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
      <WifiOff className="size-4 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-destructive">Request failed</p>
        <p className="text-muted-foreground mt-0.5 break-words">{message}</p>
        <p className="text-muted-foreground/60 mt-1">
          Make sure the backend is running at{" "}
          <code className="font-mono">localhost:8000</code>.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
