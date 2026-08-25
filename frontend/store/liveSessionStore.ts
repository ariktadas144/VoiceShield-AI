import { create } from "zustand";
import { ClaimedIdentity, ConnectionStatus, AudioSourceType } from "@/types/session";
import { RiskEvent, AlertEvent, TimeSeriesPoint } from "@/types/risk";
import { MAX_TIMELINE_POINTS, getRiskLevel } from "@/lib/constants";
import { formatTimeLabel } from "@/lib/formatters";

interface LiveSessionState {
  sessionId: string;
  connectionStatus: ConnectionStatus;
  audioSource: AudioSourceType;
  claimedIdentity: ClaimedIdentity;
  isStreaming: boolean;
  startTime: number | null;

  latestRiskEvent: RiskEvent | null;
  riskScoreHistory: TimeSeriesPoint[];
  anomalyScoreHistory: TimeSeriesPoint[];

  activeAlert: AlertEvent | null;
  isAlertModalOpen: boolean;
  isSecondaryVerificationModalOpen: boolean;

  // Actions
  startSession: (source: AudioSourceType, identity: ClaimedIdentity) => string;
  stopSession: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  pushRiskUpdate: (update: Omit<RiskEvent, "type" | "sessionId">) => void;
  triggerAlert: (alert: AlertEvent) => void;
  clearAlert: () => void;
  setAlertModalOpen: (isOpen: boolean) => void;
  setSecondaryVerificationModalOpen: (isOpen: boolean) => void;
  resetSession: () => void;
}

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  sessionId: "",
  connectionStatus: "disconnected",
  audioSource: "mic",
  claimedIdentity: "CEO",
  isStreaming: false,
  startTime: null,

  latestRiskEvent: null,
  riskScoreHistory: [],
  anomalyScoreHistory: [],

  activeAlert: null,
  isAlertModalOpen: false,
  isSecondaryVerificationModalOpen: false,

  startSession: (source, identity) => {
    const newSessionId = `VS-${Date.now().toString().slice(-6)}`;
    const now = Date.now();

    set({
      sessionId: newSessionId,
      connectionStatus: "connecting",
      audioSource: source,
      claimedIdentity: identity,
      isStreaming: true,
      startTime: now,
      latestRiskEvent: {
        type: "risk_update",
        sessionId: newSessionId,
        riskScore: 10,
        riskLevel: "Low",
        deepfakeProbability: 5,
        speakerScore: 92,
        anomalyScore: 8,
        recommendedAction: "Call identity claimed. Monitoring baseline audio features...",
        timestamp: now,
      },
      riskScoreHistory: [{ t: now, value: 10 }],
      anomalyScoreHistory: [{ t: now, value: 8 }],
      activeAlert: null,
      isAlertModalOpen: false,
    });

    return newSessionId;
  },

  stopSession: () => {
    set({
      isStreaming: false,
      connectionStatus: "disconnected",
    });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  pushRiskUpdate: (update) => {
    const { sessionId, riskScoreHistory, anomalyScoreHistory } = get();
    const currentSessionId = sessionId || "VS-DEMO";
    const ts = update.timestamp || Date.now();

    const fullEvent: RiskEvent = {
      ...update,
      type: "risk_update",
      sessionId: currentSessionId,
      riskLevel: update.riskLevel || getRiskLevel(update.riskScore),
    };

    // Rolling window update for risk score graph
    const newRiskHistory = [...riskScoreHistory, { t: ts, value: update.riskScore }];
    if (newRiskHistory.length > MAX_TIMELINE_POINTS) {
      newRiskHistory.shift();
    }

    // Rolling window update for anomaly detection graph
    const newAnomalyHistory = [...anomalyScoreHistory, { t: ts, value: update.anomalyScore }];
    if (newAnomalyHistory.length > MAX_TIMELINE_POINTS) {
      newAnomalyHistory.shift();
    }

    // Auto-trigger alert if risk is Critical or High
    let nextAlert = get().activeAlert;
    let openModal = get().isAlertModalOpen;

    if (fullEvent.riskLevel === "Critical" && !openModal) {
      nextAlert = {
        type: "alert",
        sessionId: currentSessionId,
        severity: "Critical",
        reason: `High risk score (${fullEvent.riskScore}/100). Synthetic speech signature & speaker mismatch detected.`,
        recommendedAction: fullEvent.recommendedAction || "Halt critical transactions & verify caller identity immediately.",
        timestamp: ts,
      };
      openModal = true;
    } else if (fullEvent.riskLevel === "High" && !nextAlert) {
      nextAlert = {
        type: "alert",
        sessionId: currentSessionId,
        severity: "High",
        reason: `Elevated risk score (${fullEvent.riskScore}/100). Acoustic anomaly divergence detected.`,
        recommendedAction: fullEvent.recommendedAction || "Perform out-of-band identity verification.",
        timestamp: ts,
      };
    }

    set({
      latestRiskEvent: fullEvent,
      riskScoreHistory: newRiskHistory,
      anomalyScoreHistory: newAnomalyHistory,
      activeAlert: nextAlert,
      isAlertModalOpen: openModal,
    });
  },

  triggerAlert: (alert) => {
    set({
      activeAlert: alert,
      isAlertModalOpen: alert.severity === "Critical",
    });
  },

  clearAlert: () => {
    set({ activeAlert: null, isAlertModalOpen: false });
  },

  setAlertModalOpen: (isOpen) => {
    set({ isAlertModalOpen: isOpen });
  },

  setSecondaryVerificationModalOpen: (isOpen) => {
    set({ isSecondaryVerificationModalOpen: isOpen });
  },

  resetSession: () => {
    set({
      sessionId: "",
      connectionStatus: "disconnected",
      isStreaming: false,
      startTime: null,
      latestRiskEvent: null,
      riskScoreHistory: [],
      anomalyScoreHistory: [],
      activeAlert: null,
      isAlertModalOpen: false,
      isSecondaryVerificationModalOpen: false,
    });
  },
}));
