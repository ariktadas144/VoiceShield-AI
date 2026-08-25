import { RiskLevel, FusionBreakdown } from '@/types/risk';

export interface AudioChunkOutbound {
  type: 'audio_chunk';
  sessionId: string;
  seq: number;
  audioData: string; // Base64 encoded audio
  claimedIdentity: string;
  source: 'mic' | 'upload';
}

export interface RiskUpdateInbound {
  type: 'risk_update';
  sessionId: string;
  seq: number;
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  contextScore?: number;
  recommendedAction: string;
  reason?: string;
  timestamp: number;
  fusionBreakdown?: FusionBreakdown;
}

export interface AlertInbound {
  type: 'alert';
  sessionId: string;
  severity: 'High' | 'Critical';
  reason: string;
  recommendedAction: string;
  timestamp: number;
}

export interface PongInbound {
  type: 'pong';
  timestamp: number;
}

export type SocketInboundMessage = RiskUpdateInbound | AlertInbound | PongInbound;
export type SocketOutboundMessage = AudioChunkOutbound | { type: 'ping'; timestamp: number };
