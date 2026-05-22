/**
 * useReviewStream.ts — Hook for streaming AI code reviews via SSE.
 *
 * Connects to POST /reviews/stream using the native Fetch API + ReadableStream.
 * The backend emits Server-Sent Events in the format:
 *
 *   event: token
 *   data: <markdown token>
 *
 *   event: done
 *   data:
 *
 *   event: error
 *   data: <error message>
 *
 * Usage:
 *   const { streamedText, isStreaming, error, startStream, cancel } = useReviewStream();
 *   await startStream({ code, language, preferred_model });
 */

import { useCallback, useRef, useState } from "react";
import { API_BASE_URL, type ReviewStreamRequest } from "@/lib/api";
import { getIdToken } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseReviewStreamReturn {
  /** Accumulated markdown text produced by the LLM so far. */
  streamedText: string;
  /** True while the stream is actively reading from the server. */
  isStreaming: boolean;
  /** Non-null when the stream ended with an error event or a network failure. */
  error: string | null;
  /** Kick off a new streaming review. Cancels any in-flight stream first. */
  startStream: (request: ReviewStreamRequest) => Promise<void>;
  /** Abort the current stream immediately (no-op if not streaming). */
  cancel: () => void;
  /** Reset state back to initial values. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// SSE line parser
// ---------------------------------------------------------------------------

interface SseEvent {
  type: string;
  data: string;
}

/**
 * Parse a raw SSE chunk (may contain multiple events separated by `\n\n`)
 * into a list of typed events.
 *
 * SSE field rules (RFC):
 *  - Lines starting with "event:" set the event type.
 *  - Lines starting with "data:" contribute to the data buffer.
 *  - A blank line dispatches the accumulated event.
 */
function parseSseChunk(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  // Each SSE message is separated by a blank line
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
      // Ignore comment lines (starting with ":") and id/retry fields
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

export function useReviewStream(): UseReviewStreamReturn {
  const [streamedText, setStreamedText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the AbortController so `cancel` can access it
  // without being included in dependency arrays.
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setStreamedText("");
    setError(null);
  }, [cancel]);

  const startStream = useCallback(
    async (request: ReviewStreamRequest): Promise<void> => {
      // Cancel any previously running stream before starting a new one
      cancel();

      const controller = new AbortController();
      abortRef.current = controller;

      setStreamedText("");
      setError(null);
      setIsStreaming(true);

      try {
        const token = await getIdToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/reviews/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
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
        // Read the ReadableStream manually chunk-by-chunk
        // ---------------------------------------------------------------------------
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        // Buffer to handle SSE events that span multiple chunks
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          // Decode the Uint8Array chunk into a string (stream=true = don't
          // flush the internal decode buffer on every call so multi-byte
          // characters crossing chunk boundaries are handled correctly).
          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE messages (delimited by double newlines)
          const boundaryIndex = buffer.lastIndexOf("\n\n");
          if (boundaryIndex === -1) {
            // Haven't accumulated a full event yet; keep buffering
            continue;
          }

          // Everything up to (and including) the last \n\n is ready to parse
          const completePart = buffer.slice(0, boundaryIndex + 2);
          buffer = buffer.slice(boundaryIndex + 2);

          const sseEvents = parseSseChunk(completePart);

          for (const evt of sseEvents) {
            switch (evt.type) {
              case "token":
                // The backend escapes \n as \\n; restore it here
                setStreamedText((prev) => prev + evt.data.replace(/\\n/g, "\n"));
                break;

              case "error":
                setError(evt.data);
                reader.cancel();
                return;

              case "done":
                // Stream finished cleanly; exit the loop
                reader.cancel();
                return;

              default:
                // Unknown event type — ignore silently
                break;
            }
          }
        }

        // Flush any remaining bytes in the decoder
        const remainder = decoder.decode();
        if (remainder) {
          const finalEvents = parseSseChunk(remainder);
          for (const evt of finalEvents) {
            if (evt.type === "token") {
              setStreamedText((prev) => prev + evt.data.replace(/\\n/g, "\n"));
            }
          }
        }
      } catch (err: unknown) {
        // AbortError is not a real error — the caller called cancel()
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

  return { streamedText, isStreaming, error, startStream, cancel, reset };
}
