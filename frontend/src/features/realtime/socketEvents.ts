import { RiskAssessment, SignalDetails, PreventionDetail, SignalProvenance } from '../../types/risk';

export interface WsSessionOpenMessage {
  type: 'session_open';
  backend?: string;
  window_seconds?: number;
  hop_seconds?: number;
  sample_rate?: number;
}

export interface WsBackendScoreMessage {
  type: 'score' | 'risk_update';
  window_seq?: number;
  sample_offset?: number;
  audio_time_s?: number;
  partial?: boolean;
  status?: string;
  backend?: string;
  validated?: boolean;
  warning?: string;
  signals?: SignalDetails;
  signal_provenance?: SignalProvenance;
  risk_assessment?: RiskAssessment;
  prevention_status?: PreventionDetail;
  inference_ms?: number;
  metadata?: Record<string, any>;
  
  // Alternative/flattened fields support
  sessionId?: string;
  riskScore?: number;
  riskLevel?: string;
  deepfakeProbability?: number;
  speakerScore?: number;
  anomalyScore?: number;
  recommendedAction?: string;
}

export interface WsAlertMessage {
  type: 'alert';
  sessionId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  recommendedAction?: string;
  timestamp?: string;
}

export interface WsErrorMessage {
  type: 'error';
  status?: string;
  detail?: string;
}

export interface WsSessionClosedMessage {
  type: 'session_closed';
  windows?: number;
}

export type WsInboundMessage =
  | WsSessionOpenMessage
  | WsBackendScoreMessage
  | WsAlertMessage
  | WsErrorMessage
  | WsSessionClosedMessage;

export interface WsOutboundControl {
  type: 'config' | 'eof';
  claimedIdentity?: string;
  callerNumber?: string;
  channel?: string;
  [key: string]: any;
}
