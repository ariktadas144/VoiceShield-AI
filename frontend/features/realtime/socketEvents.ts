import { ClaimedIdentity } from "@/types/session";
import { RiskLevel } from "@/types/risk";

export interface OutboundAudioChunkMessage {
  type: "audio_chunk";
  sessionId: string;
  seq: number;
  audioData: string; // Base64
  claimedIdentity: ClaimedIdentity;
}

export interface InboundRiskUpdateMessage {
  type: "risk_update";
  sessionId: string;
  seq?: number;
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  recommendedAction: string;
  timestamp: number;
}

export interface InboundAlertMessage {
  type: "alert";
  sessionId: string;
  severity: RiskLevel;
  reason: string;
  recommendedAction: string;
  timestamp: number;
}

export type InboundSocketMessage = InboundRiskUpdateMessage | InboundAlertMessage;
