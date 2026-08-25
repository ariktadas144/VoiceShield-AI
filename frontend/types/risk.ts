export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface TimePoint {
  t: number;      // Unix timestamp (ms)
  timeLabel: string; // "10:32:01"
  value: number;  // 0-100 score
  seq?: number;
}

export interface FusionBreakdown {
  deepfakeContribution: number;
  speakerMismatchContribution: number;
  prosodyContribution: number;
  contextContribution: number;
}

export interface RiskUpdatePayload {
  type: 'risk_update';
  sessionId: string;
  seq: number;
  riskScore: number;                 // 0 - 100
  riskLevel: RiskLevel;              // Low | Medium | High | Critical
  deepfakeProbability: number;       // 0.0 - 1.0 or 0 - 100
  speakerScore: number;              // 0.0 - 1.0 or 0 - 100
  anomalyScore: number;              // 0.0 - 1.0 or 0 - 100
  contextScore?: number;             // 0.0 - 1.0 or 0 - 100
  recommendedAction: string;
  reason?: string;
  timestamp: number;
  fusionBreakdown?: FusionBreakdown;
}

export interface AlertEvent {
  type: 'alert';
  sessionId: string;
  severity: 'High' | 'Critical';
  reason: string;
  recommendedAction: string;
  timestamp: number;
}
