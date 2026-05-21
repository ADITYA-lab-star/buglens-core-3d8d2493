/**
 * useDashboardData.ts — Non-streaming hook for dashboard analytics.
 *
 * Fetches data from two endpoints in parallel:
 *   GET /dashboard/stats   → { total_reviews_count, critical_bugs_caught, average_response_time }
 *   GET /dashboard/recent  → RecentReview[]  (up to 5 entries)
 *
 * Built on @tanstack/react-query for automatic caching, background refetching,
 * and standardised loading / error states.
 *
 * Usage:
 *   const { stats, recentReviews, isLoading, isError, error, refetch } = useDashboardData();
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import {
  apiFetch,
  type DashboardStats,
  type RecentReview,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Query key factory — keeps cache keys co-located with the hook
// ---------------------------------------------------------------------------

export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: () => [...dashboardKeys.all, "stats"] as const,
  recent: () => [...dashboardKeys.all, "recent"] as const,
} as const;

// ---------------------------------------------------------------------------
// Individual query hooks (exported for granular use in components)
// ---------------------------------------------------------------------------

/**
 * Fetch aggregated statistics from the backend.
 * Refetches every 30 seconds so counters stay reasonably fresh without
 * hammering the DB on every render.
 */
export function useDashboardStats() {
  return useQuery<DashboardStats, Error>({
    queryKey: dashboardKeys.stats(),
    queryFn: () => apiFetch<DashboardStats>("/dashboard/stats"),
    staleTime: 30_000,      // treat data as fresh for 30 s
    refetchInterval: 30_000, // background poll every 30 s
    retry: 2,
  });
}

/**
 * Fetch the 5 most recent reviews.
 * Refetches every 15 seconds — more frequent than stats since new reviews
 * arrive more visibly.
 */
export function useRecentReviews() {
  return useQuery<RecentReview[], Error>({
    queryKey: dashboardKeys.recent(),
    queryFn: () => apiFetch<RecentReview[]>("/dashboard/recent"),
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: 2,
  });
}

// ---------------------------------------------------------------------------
// Combined hook — fetches both endpoints in parallel
// ---------------------------------------------------------------------------

export interface UseDashboardDataReturn {
  /** Aggregated stats or undefined while loading. */
  stats: DashboardStats | undefined;
  /** Recent review list or undefined while loading. */
  recentReviews: RecentReview[] | undefined;
  /** True if either query is currently fetching for the first time. */
  isLoading: boolean;
  /** True if either query returned an error. */
  isError: boolean;
  /** First encountered error, or null if none. */
  error: Error | null;
  /** Call to manually trigger a fresh fetch of both queries. */
  refetch: () => void;
}

export function useDashboardData(): UseDashboardDataReturn {
  const [statsQuery, recentQuery] = useQueries({
    queries: [
      {
        queryKey: dashboardKeys.stats(),
        queryFn: () => apiFetch<DashboardStats>("/dashboard/stats"),
        staleTime: 30_000,
        refetchInterval: 30_000,
        retry: 2,
      },
      {
        queryKey: dashboardKeys.recent(),
        queryFn: () => apiFetch<RecentReview[]>("/dashboard/recent"),
        staleTime: 15_000,
        refetchInterval: 15_000,
        retry: 2,
      },
    ],
  });

  const isLoading = statsQuery.isLoading || recentQuery.isLoading;
  const isError = statsQuery.isError || recentQuery.isError;
  const error = statsQuery.error ?? recentQuery.error ?? null;

  const refetch = () => {
    void statsQuery.refetch();
    void recentQuery.refetch();
  };

  return {
    stats: statsQuery.data,
    recentReviews: recentQuery.data,
    isLoading,
    isError,
    error,
    refetch,
  };
}
