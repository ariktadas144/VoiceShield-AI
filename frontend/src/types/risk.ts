export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PreventionStatus = 'ALLOWED' | 'WARNING' | 'TRANSACTION_HELD' | 'BLOCKED';

export type RecommendedAction = 
  | 'CONTINUE' 
  | 'WARNING_SECONDARY_VERIFICATION' 
  | 'BLOCK_AND_ESCALATE'
  | 'SECONDARY_VERIFICATION_REQUIRED'
  | 'IMMEDIATE_TERMINATION';

export interface FusionBreakdown {
  deepfake_contribution: number;
  speaker_mismatch_contribution: number;
  prosody_contribution: number;
  context_contribution: number;
}

export interface RiskAssessment {
  risk_score: number;
  risk_level: RiskLevel;
  recommended_action: RecommendedAction;
  fusion_breakdown?: FusionBreakdown;
}

export interface PreventionDetail {
  status: PreventionStatus;
  message: string;
  verification_required: string[];
}

export interface SignalDetails {
  deepfake_probability: number;
  speaker_match: number;
  prosody_analysis?: {
    overall_prosody_risk?: number;
    pitch_anomaly?: number;
    jitter?: number;
    shimmer?: number;
  } | number;
  context_risk?: number;
}

export interface SignalProvenance {
  deepfake_probability: 'model' | 'placeholder';
  speaker_match: 'model' | 'placeholder';
  prosody_analysis: 'model' | 'placeholder';
  context_risk: 'model' | 'placeholder';
}

export interface RiskEvent {
  type?: 'score' | 'risk_update';
  sessionId?: string;
  window_seq?: number;
  sample_offset?: number;
  audio_time_s?: number;
  timestamp: string;
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  contextRisk?: number;
  recommendedAction: RecommendedAction;
  preventionStatus?: PreventionDetail;
  status?: string;
  backend?: string;
  inference_ms?: number;
  metadata?: Record<string, any>;
}
