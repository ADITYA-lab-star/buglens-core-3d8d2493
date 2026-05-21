/**
 * api.ts — Centralised API client configuration for BugLens.
 *
 * All hooks import `API_BASE_URL` from this module so that switching
 * environments (dev → staging → prod) requires a single change.
 */

// In production (Netlify), set the VITE_API_URL environment variable to the
// Render backend URL, e.g. https://buglens-api.onrender.com/api/v1
// In local dev, it falls back to localhost automatically — no .env needed.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Shared types that mirror the FastAPI Pydantic schemas
// ---------------------------------------------------------------------------

/** Shape returned by GET /dashboard/stats */
export interface DashboardStats {
  total_reviews_count: number;
  critical_bugs_caught: number;
  /** Mocked on the backend until a response_time_ms column is added. */
  average_response_time: number;
}

/** Shape of each item returned by GET /dashboard/recent */
export interface RecentReview {
  id: number;
  repository_name: string;
  file_name: string;
  ai_model_used: string;
  severity_level: string;
  review_result: Record<string, unknown>;
}

/** A single retrieved code chunk from ChromaDB, mirroring ContextChunk */
export interface ContextChunk {
  file_path: string;
  chunk_index: number;
  distance: number;
  document: string;
}

/** Payload sent to POST /reviews/stream */
export interface ReviewStreamRequest {
  code: string;
  language: string;
  preferred_model?: string;
  repository_name?: string;
  file_name?: string;
  user_id?: string;
}

/** Payload sent to POST /chat/query */
export interface ChatQueryRequest {
  repo_name: string;
  query: string;
  preferred_model?: string;
}

// ---------------------------------------------------------------------------
// Utility: typed JSON fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper around `fetch` for plain JSON endpoints.
 * Throws a descriptive `Error` on non-2xx responses so callers /
 * react-query can handle it uniformly.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore parse errors — keep the statusText fallback
    }
    throw new Error(`[${res.status}] ${detail}`);
  }

  return res.json() as Promise<T>;
}
