import { create } from 'zustand';
import { MAX_TIMELINE_POINTS, DEFAULT_IDENTITIES } from '@/lib/constants';
import { RiskLevel, RiskUpdatePayload, AlertEvent, TimePoint } from '@/types/risk';
import { AudioSourceType, ConnectionStatus, ClaimedIdentity } from '@/types/session';

interface LiveSessionState {
  // Session details
  sessionId: string;
  isAnalyzing: boolean;
  audioSource: AudioSourceType;
  claimedIdentity: ClaimedIdentity;
  connectionStatus: ConnectionStatus;
  sessionStartTime: number | null;
  elapsedSeconds: number;

  // Latest Live Metrics
  riskScore: number;
  riskLevel: RiskLevel;
  deepfakeProbability: number;
  speakerScore: number;
  anomalyScore: number;
  recommendedAction: string;
  preventionStatus: string;
  lastUpdatedTimestamp: number | null;

  // Real-time Rolling History (Capped at MAX_TIMELINE_POINTS)
  riskScoreHistory: TimePoint[];
  anomalyScoreHistory: TimePoint[];
  deepfakeHistory: TimePoint[];

  // Active Alerts
  activeAlert: AlertEvent | null;
  isCriticalModalOpen: boolean;
  isSecondaryModalOpen: boolean;

  // Actions
  startSession: (source: AudioSourceType, identity?: ClaimedIdentity) => void;
  stopSession: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setClaimedIdentity: (identity: ClaimedIdentity) => void;
  setAudioSource: (source: AudioSourceType) => void;
  handleRiskUpdate: (payload: RiskUpdatePayload) => void;
  handleAlert: (alert: AlertEvent) => void;
  clearAlert: () => void;
  setCriticalModalOpen: (open: boolean) => void;
  setSecondaryModalOpen: (open: boolean) => void;
  tickElapsed: () => void;
  resetSession: () => void;
}

const initialIdentity: ClaimedIdentity = DEFAULT_IDENTITIES[0];

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  sessionId: `sess_${Math.random().toString(36).substring(2, 9)}`,
  isAnalyzing: false,
  audioSource: 'mic',
  claimedIdentity: initialIdentity,
  connectionStatus: 'disconnected',
  sessionStartTime: null,
  elapsedSeconds: 0,

  riskScore: 0,
  riskLevel: 'Low',
  deepfakeProbability: 0,
  speakerScore: 100,
  anomalyScore: 0,
  recommendedAction: 'Ready to start live voice verification session.',
  preventionStatus: 'IDLE_NORMAL',
  lastUpdatedTimestamp: null,

  riskScoreHistory: [],
  anomalyScoreHistory: [],
  deepfakeHistory: [],

  activeAlert: null,
  isCriticalModalOpen: false,
  isSecondaryModalOpen: false,

  startSession: (source, identity) => {
    const newSessionId = `sess_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    const timeLabel = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    set({
      sessionId: newSessionId,
      isAnalyzing: true,
      audioSource: source,
      claimedIdentity: identity || get().claimedIdentity,
      connectionStatus: 'connecting',
      sessionStartTime: now,
      elapsedSeconds: 0,
      riskScore: 0,
      riskLevel: 'Low',
      deepfakeProbability: 0,
      speakerScore: 100,
      anomalyScore: 0,
      recommendedAction: 'Session started. Analyzing live audio feed...',
      preventionStatus: 'MONITORING_ACTIVE',
      lastUpdatedTimestamp: now,
      // Seed first baseline point
      riskScoreHistory: [{ t: now, timeLabel, value: 0 }],
      anomalyScoreHistory: [{ t: now, timeLabel, value: 0 }],
      deepfakeHistory: [{ t: now, timeLabel, value: 0 }],
      activeAlert: null,
      isCriticalModalOpen: false,
    });
  },

  stopSession: () => {
    set({
      isAnalyzing: false,
      connectionStatus: 'disconnected',
      preventionStatus: 'SESSION_COMPLETED',
      recommendedAction: 'Session completed. Visual evidence and telemetry frozen for review.',
    });
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setClaimedIdentity: (claimedIdentity) => set({ claimedIdentity }),

  setAudioSource: (audioSource) => set({ audioSource }),

  handleRiskUpdate: (payload) => {
    const now = payload.timestamp || Date.now();
    const timeLabel = new Date(now).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const currentRiskHistory = get().riskScoreHistory;
    const currentAnomalyHistory = get().anomalyScoreHistory;
    const currentDeepfakeHistory = get().deepfakeHistory;

    // Standardize percentages (0-100)
    const normDeepfake = payload.deepfakeProbability <= 1 ? payload.deepfakeProbability * 100 : payload.deepfakeProbability;
    const normSpeaker = payload.speakerScore <= 1 ? payload.speakerScore * 100 : payload.speakerScore;
    const normAnomaly = payload.anomalyScore <= 1 ? payload.anomalyScore * 100 : payload.anomalyScore;

    // Append to rolling window and keep within MAX_TIMELINE_POINTS
    const nextRiskPoint: TimePoint = { t: now, timeLabel, value: payload.riskScore, seq: payload.seq };
    const nextAnomalyPoint: TimePoint = { t: now, timeLabel, value: Math.round(normAnomaly), seq: payload.seq };
    const nextDeepfakePoint: TimePoint = { t: now, timeLabel, value: Math.round(normDeepfake), seq: payload.seq };

    const newRiskHistory = [...currentRiskHistory, nextRiskPoint].slice(-MAX_TIMELINE_POINTS);
    const newAnomalyHistory = [...currentAnomalyHistory, nextAnomalyPoint].slice(-MAX_TIMELINE_POINTS);
    const newDeepfakeHistory = [...currentDeepfakeHistory, nextDeepfakePoint].slice(-MAX_TIMELINE_POINTS);

    let isCriticalModal = get().isCriticalModalOpen;
    let alertObj = get().activeAlert;

    if (payload.riskLevel === 'Critical') {
      isCriticalModal = true;
      alertObj = {
        type: 'alert',
        sessionId: payload.sessionId,
        severity: 'Critical',
        reason: payload.reason || 'High synthetic voice confidence and extreme prosodic anomalies detected.',
        recommendedAction: 'BLOCK_AND_ESCALATE',
        timestamp: now,
      };
    } else if (payload.riskLevel === 'High') {
      alertObj = {
        type: 'alert',
        sessionId: payload.sessionId,
        severity: 'High',
        reason: payload.reason || 'Unusual acoustic patterns inconsistent with enrolled voiceprint.',
        recommendedAction: 'CHALLENGE_IDENTITY',
        timestamp: now,
      };
    }

    set({
      riskScore: payload.riskScore,
      riskLevel: payload.riskLevel,
      deepfakeProbability: Math.round(normDeepfake),
      speakerScore: Math.round(normSpeaker),
      anomalyScore: Math.round(normAnomaly),
      recommendedAction: payload.recommendedAction || get().recommendedAction,
      lastUpdatedTimestamp: now,
      riskScoreHistory: newRiskHistory,
      anomalyScoreHistory: newAnomalyHistory,
      deepfakeHistory: newDeepfakeHistory,
      activeAlert: alertObj,
      isCriticalModalOpen: isCriticalModal,
    });
  },

  handleAlert: (alert) => {
    set({
      activeAlert: alert,
      isCriticalModalOpen: alert.severity === 'Critical',
    });
  },

  clearAlert: () => set({ activeAlert: null, isCriticalModalOpen: false }),

  setCriticalModalOpen: (isCriticalModalOpen) => set({ isCriticalModalOpen }),

  setSecondaryModalOpen: (isSecondaryModalOpen) => set({ isSecondaryModalOpen }),

  tickElapsed: () => {
    if (get().isAnalyzing) {
      set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 }));
    }
  },

  resetSession: () => {
    set({
      sessionId: `sess_${Math.random().toString(36).substring(2, 9)}`,
      isAnalyzing: false,
      riskScore: 0,
      riskLevel: 'Low',
      deepfakeProbability: 0,
      speakerScore: 100,
      anomalyScore: 0,
      recommendedAction: 'Ready to start live voice verification session.',
      preventionStatus: 'IDLE_NORMAL',
      lastUpdatedTimestamp: null,
      riskScoreHistory: [],
      anomalyScoreHistory: [],
      deepfakeHistory: [],
      activeAlert: null,
      isCriticalModalOpen: false,
      isSecondaryModalOpen: false,
      elapsedSeconds: 0,
    });
  },
}));
