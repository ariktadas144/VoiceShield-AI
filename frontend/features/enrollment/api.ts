"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchEnrolledIdentities } from "@/lib/apiClient";

export function useEnrolledIdentities() {
  return useQuery({
    queryKey: ["enrolled-identities"],
    queryFn: fetchEnrolledIdentities,
  });
}
