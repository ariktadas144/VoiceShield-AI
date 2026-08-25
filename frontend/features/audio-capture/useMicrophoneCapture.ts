'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { CHUNK_INTERVAL_MS } from '@/lib/constants';
import { blobToBase64 } from './audioChunker';

interface UseMicrophoneCaptureOptions {
  onAudioChunk: (base64Audio: string, seq: number) => void;
  intervalMs?: number;
}

export function useMicrophoneCapture({
  onAudioChunk,
  intervalMs = CHUNK_INTERVAL_MS,
}: UseMicrophoneCaptureOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const seqCounterRef = useRef(0);
  const accumulatedChunksRef = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping MediaRecorder:', e);
      }
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing AudioContext:', e);
      }
      audioContextRef.current = null;
    }

    setAnalyserNode(null);
    setIsRecording(false);
    accumulatedChunksRef.current = [];
  }, []);

  const dispatchCurrentChunk = useCallback(async () => {
    if (accumulatedChunksRef.current.length === 0) return;
    const blob = new Blob(accumulatedChunksRef.current, { type: 'audio/webm;codecs=opus' });
    accumulatedChunksRef.current = [];
    seqCounterRef.current += 1;
    const seq = seqCounterRef.current;

    try {
      const base64 = await blobToBase64(blob);
      onAudioChunk(base64, seq);
    } catch (err) {
      console.error('Error converting microphone chunk to Base64:', err);
    }
  }, [onAudioChunk]);

  const start = useCallback(async () => {
    stop();
    setError(null);
    seqCounterRef.current = 0;
    accumulatedChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Initialize Web Audio API Analyser for live frequency visualization
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      sourceNode.connect(analyser);
      audioContextRef.current = audioCtx;
      setAnalyserNode(analyser);

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          accumulatedChunksRef.current.push(event.data);
        }
      };

      // Start recording with small internal slice so chunks are regularly delivered
      recorder.start(500);
      setIsRecording(true);

      // 3-second heartbeat chunk cadence
      intervalIdRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
          setTimeout(() => {
            dispatchCurrentChunk();
          }, 50);
        }
      }, intervalMs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      setError(msg);
      setIsRecording(false);
      console.error('Failed to start microphone recording:', err);
    }
  }, [stop, intervalMs, dispatchCurrentChunk]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    isRecording,
    error,
    analyserNode,
  };
}
