import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiClient.getDashboardSummary(),
    refetchInterval: 10000,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: () => apiClient.getRecentActivity(),
    refetchInterval: 10000,
  });
}
