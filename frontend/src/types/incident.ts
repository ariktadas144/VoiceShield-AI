import { RiskLevel, RecommendedAction, FusionBreakdown } from './risk';

export type IncidentStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'FALSE_POSITIVE' | 'ESCALATED';

export interface IncidentEvidence {
  deepfakeProbability: number;
  speakerMatchScore: number;
  prosodyAnomalyScore: number;
  contextRiskScore: number;
  audioDurationSeconds: number;
  samplesCount: number;
  fusionBreakdown?: FusionBreakdown;
  audioRecordingUrl?: string;
  transcriptionSnippet?: string;
  detectorModelUsed?: string;
}

export interface SecondaryVerificationLog {
  initiatedAt: string;
  methodUsed: 'PHONE_CALLBACK' | 'DIRECT_MFA' | 'SUPERVISOR_CONFIRM' | 'OUT_OF_BAND_SLACK';
  contactTarget: string;
  result: 'VERIFIED' | 'FAILED' | 'PENDING' | 'ABORTED';
  verifiedBy?: string;
  notes?: string;
}

export interface Incident {
  id: string;
  sessionId: string;
  timestamp: string;
  claimedIdentityName: string;
  claimedIdentityRole: string;
  claimedIdentityDepartment: string;
  callerPhone: string;
  peakRiskScore: number;
  peakRiskLevel: RiskLevel;
  status: IncidentStatus;
  actionTaken: RecommendedAction;
  summary: string;
  evidence: IncidentEvidence;
  secondaryVerification?: SecondaryVerificationLog;
  assignedAnalyst?: string;
  resolvedAt?: string;
}

export interface IncidentFilterOptions {
  status?: IncidentStatus | 'ALL';
  riskLevel?: RiskLevel | 'ALL';
  searchTerm?: string;
  dateFrom?: string;
  dateTo?: string;
}
