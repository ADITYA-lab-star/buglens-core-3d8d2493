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
  import.meta.env.VITE_API_URL || "https://buglens-core-3d8d2493.onrender.com/api/v1";

// ---------------------------------------------------------------------------
// Shared types that mirror the FastAPI Pydantic schemas
// ---------------------------------------------------------------------------

/** Shape returned by GET /dashboard/stats */
export interface DashboardStats {
  /** All-time review count for this user. */
  total_reviews_count: number;
  /** Reviews created in the current calendar month. */
  monthly_reviews_count: number;
  /** Reviews with severity_level == "critical". */
  critical_bugs_caught: number;
  /** Mean response_time_ms in seconds. 0 when field not yet populated. */
  average_response_time: number;
  /** Per-severity breakdown for the ring/bar chart. */
  severity_breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

/** Shape of each item returned by GET /dashboard/recent */
export interface RecentReview {
  id: string;
  repository_name: string;
  file_name: string;
  ai_model_used: string;
  severity_level: string;
  language: string;
  /** "completed" | "failed" — stored on the review document. */
  status: string;
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
import { getIdToken } from "@/context/AuthContext";

/**
 * Convenience wrapper around `fetch` for plain JSON endpoints.
 * Throws a descriptive `Error` on non-2xx responses so callers /
 * react-query can handle it uniformly.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getIdToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
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
