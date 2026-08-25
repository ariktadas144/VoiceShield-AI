import { RiskLevel } from "./risk";
import { ClaimedIdentity } from "./session";

export type IncidentStatus = "Open" | "Under Review" | "Resolved" | "False Positive";

export interface Incident {
  id: string;
  sessionId: string;
  claimedIdentity: ClaimedIdentity;
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  status: IncidentStatus;
  timestamp: string;
  durationSeconds: number;
  summary: string;
  recommendedAction: string;
  audioSampleUrl?: string;
}
