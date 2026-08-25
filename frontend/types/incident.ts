import { RiskLevel } from './risk';

export type IncidentStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface Incident {
  id: string;
  sessionId: string;
  timestamp: string;
  claimedIdentity: string;
  callerNumber?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  status: IncidentStatus;
  recommendedAction: string;
  actionTaken?: string;
  notes?: string;
  evidenceAudioUrl?: string;
  reviewer?: string;
}

export interface IncidentFilters {
  status?: IncidentStatus | 'ALL';
  riskLevel?: RiskLevel | 'ALL';
  search?: string;
  from?: string;
  to?: string;
}
