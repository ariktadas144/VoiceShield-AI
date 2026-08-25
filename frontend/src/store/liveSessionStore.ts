import { create } from 'zustand';
import { 
  SessionState, 
  ClaimedIdentity, 
  ConnectionStatus, 
  AudioSourceType 
} from '../types/session';
import { 
  RiskEvent, 
  RiskLevel, 
  RecommendedAction, 
  PreventionDetail 
} from '../types/risk';
import { getRiskLevelFromScore } from '../features/risk-engine-ui/riskLevel';
import { DEFAULT_CLAIMED_IDENTITIES } from '../lib/constants';

interface LiveSessionStore extends SessionState {
  // Actions
  startSession: (identity?: ClaimedIdentity | null, source?: AudioSourceType, callerNum?: string) => void;
  stopSession: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  handleRiskUpdate: (event: Partial<RiskEvent>) => void;
  setActiveAlert: (alert: SessionState['activeAlert']) => void;
  dismissAlert: () => void;
  setAudioMetrics: (level: number, speaking: boolean) => void;
  setClaimedIdentity: (identity: ClaimedIdentity | null) => void;
  setAudioSource: (source: AudioSourceType) => void;
  setCallerNumber: (number: string) => void;
  tickDuration: () => void;
  resetLiveSession: () => void;
}

const initialClaimedIdentity = DEFAULT_CLAIMED_IDENTITIES[0];

export const useLiveSessionStore = create<LiveSessionStore>((set, get) => ({
  sessionId: `call-${Date.now().toString(36)}`,
  callerNumber: '+1 (555) 019-4821',
  claimedIdentity: initialClaimedIdentity,
  audioSource: 'microphone',
  connectionStatus: 'disconnected',
  isActive: false,
  isPaused: false,
  startTime: null,
  durationSeconds: 0,
  
  latestRiskScore: 0,
  latestRiskLevel: 'LOW',
  latestDeepfakeProbability: 0,
  latestSpeakerScore: 1.0,
  latestAnomalyScore: 0,
  latestRecommendedAction: 'CONTINUE',
  latestPreventionStatus: null,
  
  timeline: [],
  activeAlert: null,
  audioLevel: 0,
  isSpeaking: false,

  startSession: (identity, source, callerNum) => {
    const newSessionId = `call-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    set({
      sessionId: newSessionId,
      isActive: true,
      isPaused: false,
      startTime: Date.now(),
      durationSeconds: 0,
      claimedIdentity: identity !== undefined ? identity : get().claimedIdentity,
      audioSource: source !== undefined ? source : get().audioSource,
      callerNumber: callerNum || get().callerNumber,
      timeline: [],
      latestRiskScore: 0,
      latestRiskLevel: 'LOW',
      latestDeepfakeProbability: 0,
      latestSpeakerScore: 0.95,
      latestAnomalyScore: 0,
      latestRecommendedAction: 'CONTINUE',
      latestPreventionStatus: {
        status: 'ALLOWED',
        message: 'Streaming audio initialized.',
        verification_required: [],
      },
      activeAlert: null,
    });
  },

  stopSession: () => {
    set({
      isActive: false,
      connectionStatus: 'disconnected',
      isSpeaking: false,
      audioLevel: 0,
    });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  handleRiskUpdate: (incoming) => {
    const score = incoming.riskScore ?? 0;
    const level: RiskLevel = incoming.riskLevel || getRiskLevelFromScore(score);
    const dfProb = incoming.deepfakeProbability ?? 0;
    const speaker = incoming.speakerScore ?? 1.0;
    const anomaly = incoming.anomalyScore ?? 0;
    const action: RecommendedAction = incoming.recommendedAction || (
      level === 'CRITICAL' || level === 'HIGH' 
        ? 'BLOCK_AND_ESCALATE' 
        : level === 'MEDIUM' 
        ? 'WARNING_SECONDARY_VERIFICATION' 
        : 'CONTINUE'
    );

    const fullEvent: RiskEvent = {
      type: incoming.type || 'score',
      sessionId: get().sessionId,
      window_seq: incoming.window_seq ?? get().timeline.length,
      sample_offset: incoming.sample_offset,
      audio_time_s: incoming.audio_time_s ?? get().durationSeconds,
      timestamp: incoming.timestamp || new Date().toISOString(),
      riskScore: score,
      riskLevel: level,
      deepfakeProbability: dfProb,
      speakerScore: speaker,
      anomalyScore: anomaly,
      recommendedAction: action,
      preventionStatus: incoming.preventionStatus,
      status: incoming.status,
      backend: incoming.backend,
      inference_ms: incoming.inference_ms,
      metadata: incoming.metadata,
    };

    const newTimeline = [...get().timeline, fullEvent];
    // Keep max 60 data points on timeline for smooth rendering
    if (newTimeline.length > 60) {
      newTimeline.shift();
    }

    // Trigger Critical Alert if level is CRITICAL
    let updatedAlert = get().activeAlert;
    if (level === 'CRITICAL') {
      updatedAlert = {
        severity: 'CRITICAL',
        title: 'Critical Threat: Deepfake Impersonation Detected',
        message: `Synthetic voice probability has surged to ${Math.round(dfProb * 100)}%. Risk score: ${score}/100. Suspend call immediately.`,
        timestamp: new Date().toISOString(),
      };
    } else if (level === 'HIGH' && !updatedAlert) {
      updatedAlert = {
        severity: 'HIGH',
        title: 'High Risk Alert: Vocal Discrepancy Detected',
        message: `High risk acoustic signatures detected (${score}/100). Secondary identity verification is strongly advised.`,
        timestamp: new Date().toISOString(),
      };
    }

    set({
      latestRiskScore: score,
      latestRiskLevel: level,
      latestDeepfakeProbability: dfProb,
      latestSpeakerScore: speaker,
      latestAnomalyScore: anomaly,
      latestRecommendedAction: action,
      latestPreventionStatus: incoming.preventionStatus || get().latestPreventionStatus,
      timeline: newTimeline,
      activeAlert: updatedAlert,
    });
  },

  setActiveAlert: (alert) => {
    set({ activeAlert: alert });
  },

  dismissAlert: () => {
    set({ activeAlert: null });
  },

  setAudioMetrics: (level, speaking) => {
    set({ audioLevel: level, isSpeaking: speaking });
  },

  setClaimedIdentity: (identity) => {
    set({ claimedIdentity: identity });
  },

  setAudioSource: (source) => {
    set({ audioSource: source });
  },

  setCallerNumber: (number) => {
    set({ callerNumber: number });
  },

  tickDuration: () => {
    if (get().isActive) {
      set((state) => ({ durationSeconds: state.durationSeconds + 1 }));
    }
  },

  resetLiveSession: () => {
    set({
      sessionId: `call-${Date.now().toString(36)}`,
      isActive: false,
      connectionStatus: 'disconnected',
      durationSeconds: 0,
      latestRiskScore: 0,
      latestRiskLevel: 'LOW',
      latestDeepfakeProbability: 0,
      latestSpeakerScore: 1.0,
      latestAnomalyScore: 0,
      latestRecommendedAction: 'CONTINUE',
      latestPreventionStatus: null,
      timeline: [],
      activeAlert: null,
      audioLevel: 0,
      isSpeaking: false,
    });
  },
}));
