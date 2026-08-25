import { RiskEvent, RiskLevel, RecommendedAction, PreventionDetail } from './risk';

export type ClaimedIdentityRole = 'CEO' | 'CFO' | 'VP Engineering' | 'Finance Director' | 'IT Admin' | 'Unknown Caller';

export interface ClaimedIdentity {
  id: string;
  name: string;
  role: ClaimedIdentityRole;
  department: string;
  officialPhone: string;
  officialEmail: string;
  hasVoiceProfile: boolean;
  avatarUrl?: string;
  confidenceThreshold: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type AudioSourceType = 'microphone' | 'upload';

export interface SessionState {
  sessionId: string;
  callerNumber: string;
  claimedIdentity: ClaimedIdentity | null;
  audioSource: AudioSourceType;
  connectionStatus: ConnectionStatus;
  isActive: boolean;
  isPaused: boolean;
  startTime: number | null;
  durationSeconds: number;
  
  // Realtime live telemetry
  latestRiskScore: number;
  latestRiskLevel: RiskLevel;
  latestDeepfakeProbability: number;
  latestSpeakerScore: number;
  latestAnomalyScore: number;
  latestRecommendedAction: RecommendedAction;
  latestPreventionStatus: PreventionDetail | null;
  
  // History series
  timeline: RiskEvent[];
  
  // Active Alert
  activeAlert: {
    severity: RiskLevel;
    title: string;
    message: string;
    timestamp: string;
  } | null;

  // Audio live metrics for visualization
  audioLevel: number;
  isSpeaking: boolean;
}
