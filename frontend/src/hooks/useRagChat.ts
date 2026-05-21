/**
 * useRagChat.ts — Hook for streaming RAG-powered chat answers via SSE.
 *
 * Connects to POST /chat/query which emits a three-phase SSE stream:
 *
 *   Phase 1 — context event (one shot, JSON array of ContextChunk)
 *   event: context
 *   data: [{"file_path": "...", "chunk_index": 0, "distance": 0.12, "document": "..."}]
 *
 *   Phase 2 — token events (one per LLM token)
 *   event: token
 *   data: <text token>
 *
 *   Phase 3 — stream termination
 *   event: done
 *   data:
 *
 * Usage:
 *   const { contextFiles, streamingAnswer, isStreaming, error, ask, cancel, reset } = useRagChat();
 *   await ask({ repo_name: "owner/repo", query: "How is auth handled?" });
 */

import { useCallback, useRef, useState } from "react";
import { API_BASE_URL, type ChatQueryRequest, type ContextChunk } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseRagChatReturn {
  /**
   * Retrieved code chunks emitted by the first SSE event.
   * Empty array until the 'context' event arrives.
   */
  contextFiles: ContextChunk[];
  /** Accumulated LLM answer text built up token by token. */
  streamingAnswer: string;
  /** True while actively reading from the server stream. */
  isStreaming: boolean;
  /** Non-null when a network error or an 'error' SSE event occurs. */
  error: string | null;
  /** Send a new query. Cancels any in-flight stream first. */
  ask: (request: ChatQueryRequest) => Promise<void>;
  /** Abort the active stream immediately. */
  cancel: () => void;
  /** Clear all state back to initial values. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Internal SSE parser (reused pattern from useReviewStream)
// ---------------------------------------------------------------------------

interface SseEvent {
  type: string;
  data: string;
}

function parseSseChunk(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  const messages = raw.split(/\n\n/);

  for (const message of messages) {
    if (!message.trim()) continue;

    let type = "message";
    const dataLines: string[] = [];

    for (const line of message.split("\n")) {
      if (line.startsWith("event:")) {
        type = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      events.push({ type, data: dataLines.join("\n") });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRagChat(): UseRagChatReturn {
  const [contextFiles, setContextFiles] = useState<ContextChunk[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setContextFiles([]);
    setStreamingAnswer("");
    setError(null);
  }, [cancel]);

  const ask = useCallback(
    async (request: ChatQueryRequest): Promise<void> => {
      cancel();

      const controller = new AbortController();
      abortRef.current = controller;

      // Reset answer + context for the new query but keep previous context
      // visible until the new one arrives (UX: avoids a flash of empty state).
      setStreamingAnswer("");
      setError(null);
      setIsStreaming(true);

      try {
        const response = await fetch(`${API_BASE_URL}/chat/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo_name: request.repo_name,
            query: request.query,
            preferred_model: request.preferred_model ?? "openai",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = response.statusText;
          try {
            const body = await response.json();
            detail = body?.detail ?? detail;
          } catch {
            /* ignore */
          }
          throw new Error(`[${response.status}] ${detail}`);
        }

        if (!response.body) {
          throw new Error("Response body is null — server did not send a stream.");
        }

        // ---------------------------------------------------------------------------
        // Manually read ReadableStream and parse SSE events
        // ---------------------------------------------------------------------------
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const boundaryIndex = buffer.lastIndexOf("\n\n");
          if (boundaryIndex === -1) continue;

          const completePart = buffer.slice(0, boundaryIndex + 2);
          buffer = buffer.slice(boundaryIndex + 2);

          const sseEvents = parseSseChunk(completePart);

          for (const evt of sseEvents) {
            switch (evt.type) {
              case "context": {
                // Backend emits a JSON array of ContextChunk objects
                try {
                  const chunks = JSON.parse(evt.data) as ContextChunk[];
                  setContextFiles(chunks);
                } catch {
                  // Malformed JSON — set an empty array rather than crash
                  setContextFiles([]);
                }
                break;
              }

              case "token":
                // Tokens are NOT escaped (unlike the review stream) —
                // the backend emits them verbatim.
                setStreamingAnswer((prev) => prev + evt.data);
                break;

              case "error":
                setError(evt.data);
                reader.cancel();
                return;

              case "done":
                reader.cancel();
                return;

              default:
                break;
            }
          }
        }

        // Flush decoder tail
        const remainder = decoder.decode();
        if (remainder) {
          const finalEvents = parseSseChunk(remainder);
          for (const evt of finalEvents) {
            if (evt.type === "token") {
              setStreamingAnswer((prev) => prev + evt.data);
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [cancel],
  );

  return { contextFiles, streamingAnswer, isStreaming, error, ask, cancel, reset };
}
