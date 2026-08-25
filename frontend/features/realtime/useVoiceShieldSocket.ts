'use client';

import { useEffect, useRef, useCallback } from 'react';
import { VoiceShieldSocketClient } from './socketClient';
import { SocketInboundMessage } from './socketEvents';
import { useLiveSessionStore } from '@/store/liveSessionStore';

export function useVoiceShieldSocket(sessionId: string | null) {
  const socketRef = useRef<VoiceShieldSocketClient | null>(null);
  const isAnalyzing = useLiveSessionStore((s) => s.isAnalyzing);
  const handleRiskUpdate = useLiveSessionStore((s) => s.handleRiskUpdate);
  const handleAlert = useLiveSessionStore((s) => s.handleAlert);
  const setConnectionStatus = useLiveSessionStore((s) => s.setConnectionStatus);
  const connectionStatus = useLiveSessionStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!sessionId || !isAnalyzing) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const client = new VoiceShieldSocketClient(sessionId);
    socketRef.current = client;

    const unbindStatus = client.onStatus((status) => {
      setConnectionStatus(status);
    });

    const unbindMessage = client.onMessage((msg: SocketInboundMessage) => {
      if (msg.type === 'risk_update') {
        handleRiskUpdate(msg);
      } else if (msg.type === 'alert') {
        handleAlert(msg);
      }
    });

    client.connect();

    return () => {
      unbindStatus();
      unbindMessage();
      client.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, isAnalyzing, handleRiskUpdate, handleAlert, setConnectionStatus]);

  const sendAudioChunk = useCallback(
    (audioBase64: string, seq: number, claimedIdentity: string, source: 'mic' | 'upload' = 'mic') => {
      if (socketRef.current) {
        socketRef.current.send({
          type: 'audio_chunk',
          sessionId: sessionId || 'default_session',
          seq,
          audioData: audioBase64,
          claimedIdentity,
          source,
        });
      }
    },
    [sessionId]
  );

  return {
    connectionStatus,
    sendAudioChunk,
  };
}
