import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/apiClient';

export interface DashboardSummary {
  totalVerifications: number;
  highRiskDetections: number;
  incidentsReported: number;
  resolvedIncidents: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  protectedValueEstimated: string;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'VERIFICATION_PASSED' | 'HIGH_RISK_FLAG' | 'INCIDENT_FILED' | 'SECONDARY_AUTH_SUCCESS' | 'CALL_TERMINATED';
  title: string;
  description: string;
  riskScore: number;
  claimedIdentity: string;
}

const MOCK_SUMMARY: DashboardSummary = {
  totalVerifications: 1248,
  highRiskDetections: 42,
  incidentsReported: 19,
  resolvedIncidents: 17,
  riskDistribution: {
    low: 940,
    medium: 266,
    high: 31,
    critical: 11,
  },
  protectedValueEstimated: '$4.2M',
};

const MOCK_ACTIVITIES: ActivityItem[] = [
  {
    id: 'act-1',
    timestamp: new Date(Date.now() - 3 * 60000).toISOString(),
    type: 'HIGH_RISK_FLAG',
    title: 'Impersonation Attempt Intercepted',
    description: 'Call claiming to be Alexander Vance (CEO) flagged with 92% deepfake score.',
    riskScore: 92,
    claimedIdentity: 'Alexander Vance (CEO)',
  },
  {
    id: 'act-2',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    type: 'SECONDARY_AUTH_SUCCESS',
    title: 'Out-of-band Callback Verified',
    description: 'Finance department verified legitimate wire inquiry from Marcus Chen.',
    riskScore: 18,
    claimedIdentity: 'Marcus Chen (VP Eng)',
  },
  {
    id: 'act-3',
    timestamp: new Date(Date.now() - 42 * 60000).toISOString(),
    type: 'INCIDENT_FILED',
    title: 'Security Incident #SEC-892 Logged',
    description: 'Deepfake voice synthesis sample archived for forensic analysis.',
    riskScore: 84,
    claimedIdentity: 'Elena Rostova (CFO)',
  },
  {
    id: 'act-4',
    timestamp: new Date(Date.now() - 110 * 60000).toISOString(),
    type: 'VERIFICATION_PASSED',
    title: 'Routine Voice Match Confirmed',
    description: 'Internal standup bridge authentication passed acoustic threshold.',
    riskScore: 8,
    claimedIdentity: 'Sarah Jenkins (Finance)',
  },
];

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      try {
        const data = await apiGet<DashboardSummary>('/api/dashboard/summary');
        return data;
      } catch (err) {
        // Graceful mock fallback if endpoint is not implemented on backend
        return MOCK_SUMMARY;
      }
    },
  });
}

export function useRecentActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: async () => {
      try {
        const data = await apiGet<ActivityItem[]>('/api/dashboard/recent-activity');
        return data;
      } catch (err) {
        return MOCK_ACTIVITIES;
      }
    },
  });
}
