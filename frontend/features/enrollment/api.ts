import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { VoiceEnrollmentRequest } from '@/types/enrollment';

export function useIdentities() {
  return useQuery({
    queryKey: ['enrollment', 'identities'],
    queryFn: () => apiClient.getIdentities(),
  });
}

export function useEnrollVoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VoiceEnrollmentRequest) => apiClient.enrollVoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment', 'identities'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
