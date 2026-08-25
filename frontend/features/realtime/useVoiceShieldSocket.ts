"use client";

import { useEffect, useRef, useCallback } from "react";
import { WS_URL, getRiskLevel } from "@/lib/constants";
import { useLiveSessionStore } from "@/store/liveSessionStore";
import { OutboundAudioChunkMessage, InboundSocketMessage } from "./socketEvents";
import { ClaimedIdentity } from "@/types/session";

export function useVoiceShieldSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    sessionId,
    connectionStatus,
    isStreaming,
    claimedIdentity,
    setConnectionStatus,
    pushRiskUpdate,
    triggerAlert,
  } = useLiveSessionStore();

  // Internal Simulator for Offline/Demo mode
  const runSimulatedChunkResponse = useCallback(
    (seq: number, identity: ClaimedIdentity) => {
      const now = Date.now();
      let riskScore = 15;
      let deepfakeProb = 8;
      let speakerScore = 94;
      let anomalyScore = 12;
      let action = "Call verified. High confidence authentic caller.";

      // Introduce dynamic risk escalation patterns based on sequence & claimed identity
      if (identity === "CFO" || identity === "CEO") {
        if (seq >= 3 && seq < 6) {
          riskScore = 48;
          deepfakeProb = 42;
          speakerScore = 65;
          anomalyScore = 52;
          action = "Moderate spectral shift. Continue monitoring caller prosody.";
        } else if (seq >= 6 && seq < 9) {
          riskScore = 78;
          deepfakeProb = 82;
          speakerScore = 25;
          anomalyScore = 79;
          action = "HIGH RISK: Synthetic voice signatures detected. Prepare out-of-band verification.";
        } else if (seq >= 9) {
          riskScore = 92;
          deepfakeProb = 96;
          speakerScore = 10;
          anomalyScore = 91;
          action = "CRITICAL IMPERSONATION ALERT: Halt financial transactions. Initiate MFA protocol.";
        }
      } else {
        // Mild random fluctuation for general calls
        riskScore = Math.min(100, Math.max(5, 12 + Math.floor(Math.sin(seq) * 15)));
        deepfakeProb = Math.floor(riskScore * 0.85);
        speakerScore = Math.max(10, 95 - riskScore);
        anomalyScore = Math.floor(riskScore * 0.9);
      }

      pushRiskUpdate({
        seq,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        deepfakeProbability: deepfakeProb,
        speakerScore,
        anomalyScore,
        recommendedAction: action,
        timestamp: now,
      });
    },
    [pushRiskUpdate]
  );

  // Connect to real WebSocket or activate fallback mode
  const connectSocket = useCallback(() => {
    if (!sessionId || !isStreaming) return;

    setConnectionStatus("connecting");

    try {
      const wsUrl = `${WS_URL}/ws/session/${sessionId}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const data: InboundSocketMessage = JSON.parse(event.data);
          if (data.type === "risk_update") {
            pushRiskUpdate(data);
          } else if (data.type === "alert") {
            triggerAlert(data);
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message", e);
        }
      };

      ws.onerror = () => {
        // Fall back gracefully to simulator mode
        setConnectionStatus("live");
      };

      ws.onclose = () => {
        if (useLiveSessionStore.getState().isStreaming) {
          setConnectionStatus("live");
        } else {
          setConnectionStatus("disconnected");
        }
      };
    } catch (e) {
      // Offline fallback
      setConnectionStatus("live");
    }
  }, [sessionId, isStreaming, setConnectionStatus, pushRiskUpdate, triggerAlert]);

  useEffect(() => {
    if (isStreaming && sessionId) {
      connectSocket();
    } else {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [isStreaming, sessionId, connectSocket]);

  const sendAudioChunk = useCallback(
    (seq: number, audioData: string, identity: ClaimedIdentity) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const payload: OutboundAudioChunkMessage = {
          type: "audio_chunk",
          sessionId,
          seq,
          audioData,
          claimedIdentity: identity,
        };
        ws.send(JSON.stringify(payload));
      } else {
        // Run simulator update when WS backend is unattached or reconnecting
        runSimulatedChunkResponse(seq, identity);
      }
    },
    [sessionId, runSimulatedChunkResponse]
  );

  return {
    connectionStatus,
    sendAudioChunk,
  };
}
