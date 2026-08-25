"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchIncidents, updateIncidentStatus } from "@/lib/apiClient";
import { IncidentStatus } from "@/types/incident";

export function useIncidents() {
  return useQuery({
    queryKey: ["incidents"],
    queryFn: fetchIncidents,
  });
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: IncidentStatus }) =>
      updateIncidentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["recent-incidents"] });
    },
  });
}
