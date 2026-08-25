import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EnrolledIdentity } from '../../types/enrollment';
import { apiGet, apiPost } from '../../lib/apiClient';

const MOCK_IDENTITIES: EnrolledIdentity[] = [
  {
    id: 'id-ceo',
    name: 'Alexander Vance',
    role: 'CEO',
    department: 'Executive Leadership',
    email: 'a.vance@enterprise-corp.internal',
    phone: '+1 (555) 234-5678',
    status: 'ENROLLED',
    enrolledAt: '2026-06-12T10:30:00Z',
    samplesCount: 4,
    voiceVectorModel: 'ECAPA-TDNN-v2 (512-dim)',
    lastVerifiedAt: '2026-08-25T14:10:00Z',
  },
  {
    id: 'id-cfo',
    name: 'Elena Rostova',
    role: 'CFO',
    department: 'Treasury & Finance',
    email: 'e.rostova@enterprise-corp.internal',
    phone: '+1 (555) 345-6789',
    status: 'ENROLLED',
    enrolledAt: '2026-06-14T09:15:00Z',
    samplesCount: 3,
    voiceVectorModel: 'ECAPA-TDNN-v2 (512-dim)',
    lastVerifiedAt: '2026-08-24T18:40:00Z',
  },
  {
    id: 'id-vp-eng',
    name: 'Marcus Chen',
    role: 'VP Engineering',
    department: 'Product & Tech',
    email: 'm.chen@enterprise-corp.internal',
    phone: '+1 (555) 456-7890',
    status: 'ENROLLED',
    enrolledAt: '2026-07-02T16:00:00Z',
    samplesCount: 5,
    voiceVectorModel: 'ECAPA-TDNN-v2 (512-dim)',
    lastVerifiedAt: '2026-08-25T09:20:00Z',
  },
  {
    id: 'id-finance-dir',
    name: 'Sarah Jenkins',
    role: 'Finance Director',
    department: 'Global Payroll & Wires',
    email: 's.jenkins@enterprise-corp.internal',
    phone: '+1 (555) 567-8901',
    status: 'NOT_ENROLLED',
    samplesCount: 0,
  },
  {
    id: 'id-it-admin',
    name: 'David Patel',
    role: 'IT Admin / Infrastructure',
    department: 'Corporate IT Sec',
    email: 'd.patel@enterprise-corp.internal',
    phone: '+1 (555) 678-9012',
    status: 'PENDING',
    samplesCount: 1,
  },
];

let inMemoryIdentities = [...MOCK_IDENTITIES];

export function useEnrolledIdentities() {
  return useQuery<EnrolledIdentity[]>({
    queryKey: ['enrollment', 'identities'],
    queryFn: async () => {
      try {
        const data = await apiGet<EnrolledIdentity[]>('/api/enrollment/identities');
        return data;
      } catch (err) {
        return inMemoryIdentities;
      }
    },
  });
}

export function useEnrollVoiceProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identityId, audioBlob, durationSeconds }: { identityId: string; audioBlob: Blob; durationSeconds: number }) => {
      const formData = new FormData();
      formData.append('identity_id', identityId);
      formData.append('file', audioBlob, 'sample.wav');
      formData.append('duration_seconds', durationSeconds.toString());

      try {
        return await apiPost<EnrolledIdentity>('/api/enrollment/identities', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err) {
        // Update local mock
        inMemoryIdentities = inMemoryIdentities.map((id) =>
          id.id === identityId
            ? {
                ...id,
                status: 'ENROLLED' as const,
                enrolledAt: new Date().toISOString(),
                samplesCount: id.samplesCount + 1,
                voiceVectorModel: 'ECAPA-TDNN-v2 (512-dim)',
              }
            : id
        );
        return inMemoryIdentities.find((i) => i.id === identityId)!;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment'] });
    },
  });
}
