"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary, fetchRecentActivity } from "@/lib/apiClient";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ["recent-activity"],
    queryFn: fetchRecentActivity,
  });
}
