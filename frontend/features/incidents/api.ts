import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { IncidentFilters, IncidentStatus, Incident } from '@/types/incident';

export function useIncidents(filters?: IncidentFilters) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: () => apiClient.getIncidents(filters),
  });
}

export function useIncidentDetail(id: string | null) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => (id ? apiClient.getIncidentById(id) : null),
    enabled: !!id,
  });
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: IncidentStatus; notes?: string }) =>
      apiClient.updateIncidentStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (incidentData: Partial<Incident>) => apiClient.createIncident(incidentData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
