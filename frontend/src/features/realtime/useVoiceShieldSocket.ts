import { useEffect, useRef, useCallback } from 'react';
import { useLiveSessionStore } from '../../store/liveSessionStore';
import { VoiceShieldSocketClient } from './socketClient';
import { WsInboundMessage, WsBackendScoreMessage, WsAlertMessage } from './socketEvents';
import { getRiskLevelFromScore } from '../risk-engine-ui/riskLevel';
import { WS_BASE_URL } from '../../lib/constants';

export function useVoiceShieldSocket() {
  const sessionId = useLiveSessionStore((state) => state.sessionId);
  const claimedIdentity = useLiveSessionStore((state) => state.claimedIdentity);
  const callerNumber = useLiveSessionStore((state) => state.callerNumber);
  const isActive = useLiveSessionStore((state) => state.isActive);
  const connectionStatus = useLiveSessionStore((state) => state.connectionStatus);
  const setConnectionStatus = useLiveSessionStore((state) => state.setConnectionStatus);
  const handleRiskUpdate = useLiveSessionStore((state) => state.handleRiskUpdate);
  const setActiveAlert = useLiveSessionStore((state) => state.setActiveAlert);

  const socketClientRef = useRef<VoiceShieldSocketClient | null>(null);

  useEffect(() => {
    if (!socketClientRef.current) {
      // Connect to `/api/analyze-stream` (matching backend stream.py)
      socketClientRef.current = new VoiceShieldSocketClient({
        url: `${WS_BASE_URL}/api/analyze-stream`,
      });
    }

    const client = socketClientRef.current;

    const unsubStatus = client.onStatus((status) => {
      setConnectionStatus(status);
    });

    const unsubMessage = client.onMessage((msg: WsInboundMessage) => {
      if (msg.type === 'score' || msg.type === 'risk_update') {
        const scoreMsg = msg as WsBackendScoreMessage;
        
        // Extract signals and risk assessment
        const riskScore = scoreMsg.risk_assessment?.risk_score ?? scoreMsg.riskScore ?? 0;
        const riskLevel = scoreMsg.risk_assessment?.risk_level ?? scoreMsg.riskLevel ?? getRiskLevelFromScore(riskScore);
        const dfProb = scoreMsg.signals?.deepfake_probability ?? scoreMsg.deepfakeProbability ?? 0;
        const speaker = scoreMsg.signals?.speaker_match ?? scoreMsg.speakerScore ?? 1.0;
        
        const prosody = scoreMsg.signals?.prosody_analysis;
        const anomaly = typeof prosody === 'object' 
          ? (prosody?.overall_prosody_risk ?? 0) 
          : (typeof prosody === 'number' ? prosody : (scoreMsg.anomalyScore ?? 0));
        
        const action = scoreMsg.risk_assessment?.recommended_action ?? scoreMsg.recommendedAction;

        handleRiskUpdate({
          type: 'score',
          window_seq: scoreMsg.window_seq,
          sample_offset: scoreMsg.sample_offset,
          audio_time_s: scoreMsg.audio_time_s,
          riskScore,
          riskLevel: riskLevel as any,
          deepfakeProbability: dfProb,
          speakerScore: speaker,
          anomalyScore: anomaly,
          recommendedAction: action as any,
          preventionStatus: scoreMsg.prevention_status,
          status: scoreMsg.status,
          backend: scoreMsg.backend,
          inference_ms: scoreMsg.inference_ms,
          metadata: scoreMsg.metadata,
        });
      } else if (msg.type === 'alert') {
        const alertMsg = msg as WsAlertMessage;
        setActiveAlert({
          severity: alertMsg.severity,
          title: `Security Alert: ${alertMsg.severity} Risk`,
          message: alertMsg.reason,
          timestamp: alertMsg.timestamp || new Date().toISOString(),
        });
      }
    });

    return () => {
      unsubStatus();
      unsubMessage();
    };
  }, [setConnectionStatus, handleRiskUpdate, setActiveAlert]);

  // Connect when session is active
  useEffect(() => {
    const client = socketClientRef.current;
    if (isActive) {
      client?.connect();
      // Send initial metadata
      if (client?.isConnected()) {
        client.sendControl({
          type: 'config',
          claimedIdentity: claimedIdentity?.name,
          claimedRole: claimedIdentity?.role,
          callerNumber,
        });
      }
    } else {
      client?.close();
    }
  }, [isActive, claimedIdentity, callerNumber]);

  const sendAudioChunk = useCallback((chunk: Float32Array) => {
    const client = socketClientRef.current;
    if (client && client.isConnected()) {
      client.sendBinary(chunk);
    }
  }, []);

  const sendControl = useCallback((control: any) => {
    const client = socketClientRef.current;
    if (client && client.isConnected()) {
      client.sendControl(control);
    }
  }, []);

  return {
    connectionStatus,
    sendAudioChunk,
    sendControl,
  };
}
