import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Incident, IncidentFilterOptions, IncidentStatus } from './types';
import { apiGet, apiPatch, apiPost } from '../../lib/apiClient';

const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'INC-2026-0891',
    sessionId: 'call-983dfa-8392',
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
    claimedIdentityName: 'Alexander Vance',
    claimedIdentityRole: 'CEO',
    claimedIdentityDepartment: 'Executive Leadership',
    callerPhone: '+1 (555) 902-1849 [SPOOFED]',
    peakRiskScore: 94,
    peakRiskLevel: 'CRITICAL',
    status: 'OPEN',
    actionTaken: 'BLOCK_AND_ESCALATE',
    summary: 'Caller requested immediate wire authorization of $240,000 for foreign acquisition. Acoustic phase alignment showed severe vocoder artifacts matching ElevenLabs neural voice clone.',
    evidence: {
      deepfakeProbability: 0.94,
      speakerMatchScore: 0.12,
      prosodyAnomalyScore: 0.78,
      contextRiskScore: 0.95,
      audioDurationSeconds: 42,
      samplesCount: 14,
      detectorModelUsed: 'Dhwani-S2S-Fusion',
      fusionBreakdown: {
        deepfake_contribution: 37.6,
        speaker_mismatch_contribution: 22.0,
        prosody_contribution: 11.7,
        context_contribution: 19.0,
      },
      transcriptionSnippet: '"We have a critical closing in 30 minutes, override the multi-sig protocol immediately and send the preliminary wire."',
    },
    secondaryVerification: {
      initiatedAt: new Date(Date.now() - 6 * 60000).toISOString(),
      methodUsed: 'PHONE_CALLBACK',
      contactTarget: '+1 (555) 234-5678 (Alexander Vance Official)',
      result: 'FAILED',
      notes: 'Real Alexander Vance reached on official line confirmed he is in board meeting and never placed call.',
    },
    assignedAnalyst: 'SecOps Tier 2',
  },
  {
    id: 'INC-2026-0889',
    sessionId: 'call-773abc-1102',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    claimedIdentityName: 'Elena Rostova',
    claimedIdentityRole: 'CFO',
    claimedIdentityDepartment: 'Treasury & Finance',
    callerPhone: '+1 (555) 301-4491',
    peakRiskScore: 82,
    peakRiskLevel: 'CRITICAL',
    status: 'UNDER_REVIEW',
    actionTaken: 'BLOCK_AND_ESCALATE',
    summary: 'Voice characteristics matched synthetic pitch cadence. High context risk keyword trigger ("emergency supplier invoice").',
    evidence: {
      deepfakeProbability: 0.82,
      speakerMatchScore: 0.35,
      prosodyAnomalyScore: 0.64,
      contextRiskScore: 0.88,
      audioDurationSeconds: 28,
      samplesCount: 9,
      detectorModelUsed: 'Dhwani-S2S-Fusion',
      transcriptionSnippet: '"Elena here, accounts payable needs to reroute the quarterly vendor disbursement to the new account."',
    },
    assignedAnalyst: 'Alex Morgan (SecOps)',
  },
  {
    id: 'INC-2026-0874',
    sessionId: 'call-4421cc-9921',
    timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
    claimedIdentityName: 'Marcus Chen',
    claimedIdentityRole: 'VP Engineering',
    claimedIdentityDepartment: 'Product & Tech',
    callerPhone: '+1 (555) 456-7890',
    peakRiskScore: 48,
    peakRiskLevel: 'MEDIUM',
    status: 'RESOLVED',
    actionTaken: 'WARNING_SECONDARY_VERIFICATION',
    summary: 'Audio exhibited jitter and compression artifacts due to bad roaming connection. Verified identity through out-of-band Okta push.',
    evidence: {
      deepfakeProbability: 0.22,
      speakerMatchScore: 0.72,
      prosodyAnomalyScore: 0.44,
      contextRiskScore: 0.30,
      audioDurationSeconds: 65,
      samplesCount: 22,
      detectorModelUsed: 'Dhwani-S2S-Fusion',
    },
    secondaryVerification: {
      initiatedAt: new Date(Date.now() - 175 * 60000).toISOString(),
      methodUsed: 'DIRECT_MFA',
      contactTarget: 'Marcus Chen (Okta Push)',
      result: 'VERIFIED',
      verifiedBy: 'IT Helpdesk',
      notes: 'Okta Number Challenge verified successfully by Marcus.',
    },
    resolvedAt: new Date(Date.now() - 170 * 60000).toISOString(),
  },
  {
    id: 'INC-2026-0865',
    sessionId: 'call-10928a-3301',
    timestamp: new Date(Date.now() - 400 * 60000).toISOString(),
    claimedIdentityName: 'Sarah Jenkins',
    claimedIdentityRole: 'Finance Director',
    claimedIdentityDepartment: 'Global Payroll & Wires',
    callerPhone: '+1 (555) 567-8901',
    peakRiskScore: 35,
    peakRiskLevel: 'MEDIUM',
    status: 'FALSE_POSITIVE',
    actionTaken: 'CONTINUE',
    summary: 'Slight acoustic distortion caused by airport terminal background noise. Voice verified clean upon filtering.',
    evidence: {
      deepfakeProbability: 0.15,
      speakerMatchScore: 0.88,
      prosodyAnomalyScore: 0.35,
      contextRiskScore: 0.20,
      audioDurationSeconds: 30,
      samplesCount: 10,
    },
    resolvedAt: new Date(Date.now() - 390 * 60000).toISOString(),
  },
];

let inMemoryIncidents = [...MOCK_INCIDENTS];

export function useIncidents(filters?: IncidentFilterOptions) {
  return useQuery<Incident[]>({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      try {
        const queryParams = new URLSearchParams();
        if (filters?.status && filters.status !== 'ALL') queryParams.set('status', filters.status);
        if (filters?.riskLevel && filters.riskLevel !== 'ALL') queryParams.set('riskLevel', filters.riskLevel);
        if (filters?.searchTerm) queryParams.set('search', filters.searchTerm);

        const data = await apiGet<Incident[]>(`/api/incidents?${queryParams.toString()}`);
        return data;
      } catch (err) {
        // Filter in-memory mock if endpoint unavailable
        let filtered = inMemoryIncidents;
        if (filters?.status && filters.status !== 'ALL') {
          filtered = filtered.filter((i) => i.status === filters.status);
        }
        if (filters?.riskLevel && filters.riskLevel !== 'ALL') {
          filtered = filtered.filter((i) => i.peakRiskLevel === filters.riskLevel);
        }
        if (filters?.searchTerm) {
          const search = filters.searchTerm.toLowerCase();
          filtered = filtered.filter(
            (i) =>
              i.id.toLowerCase().includes(search) ||
              i.claimedIdentityName.toLowerCase().includes(search) ||
              i.summary.toLowerCase().includes(search)
          );
        }
        return filtered;
      }
    },
  });
}

export function useIncidentDetail(id?: string) {
  return useQuery<Incident | null>({
    queryKey: ['incident', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      try {
        return await apiGet<Incident>(`/api/incidents/${id}`);
      } catch (err) {
        return inMemoryIncidents.find((i) => i.id === id) || null;
      }
    },
  });
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: IncidentStatus; notes?: string }) => {
      try {
        return await apiPatch<Incident>(`/api/incidents/${id}`, { status, notes });
      } catch (err) {
        // Update local mock store
        inMemoryIncidents = inMemoryIncidents.map((inc) =>
          inc.id === id ? { ...inc, status, resolvedAt: status === 'RESOLVED' ? new Date().toISOString() : inc.resolvedAt } : inc
        );
        return inMemoryIncidents.find((i) => i.id === id)!;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newIncident: Partial<Incident>) => {
      const incident: Incident = {
        id: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        sessionId: newIncident.sessionId || `session-${Date.now()}`,
        timestamp: new Date().toISOString(),
        claimedIdentityName: newIncident.claimedIdentityName || 'Unknown Caller',
        claimedIdentityRole: newIncident.claimedIdentityRole || 'Unknown',
        claimedIdentityDepartment: newIncident.claimedIdentityDepartment || 'General',
        callerPhone: newIncident.callerPhone || 'Spoofed / Unknown',
        peakRiskScore: newIncident.peakRiskScore || 85,
        peakRiskLevel: newIncident.peakRiskLevel || 'CRITICAL',
        status: 'OPEN',
        actionTaken: newIncident.actionTaken || 'BLOCK_AND_ESCALATE',
        summary: newIncident.summary || 'Critical AI impersonation flag logged during live stream.',
        evidence: newIncident.evidence || {
          deepfakeProbability: 0.92,
          speakerMatchScore: 0.15,
          prosodyAnomalyScore: 0.70,
          contextRiskScore: 0.85,
          audioDurationSeconds: 15,
          samplesCount: 5,
        },
      };

      try {
        return await apiPost<Incident>('/api/incidents', incident);
      } catch (err) {
        inMemoryIncidents = [incident, ...inMemoryIncidents];
        return incident;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
