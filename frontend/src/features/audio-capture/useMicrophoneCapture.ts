import { useState, useRef, useCallback, useEffect } from 'react';
import { TARGET_SAMPLE_RATE, computeRmsVolume } from './audioChunker';

export interface UseMicrophoneCaptureOptions {
  onAudioChunk?: (pcmChunk: Float32Array) => void;
  onVolumeChange?: (volume: number, isSpeaking: boolean) => void;
  chunkDurationMs?: number; // default 500ms (matching backend HOP_SAMPLES)
}

export function useMicrophoneCapture({
  onAudioChunk,
  onVolumeChange,
  chunkDurationMs = 500,
}: UseMicrophoneCaptureOptions = {}) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const chunkBufferRef = useRef<Float32Array[]>([]);
  const samplesAccumulatedRef = useRef<number>(0);
  const samplesPerChunk = Math.floor((TARGET_SAMPLE_RATE * chunkDurationMs) / 1000);

  const stop = useCallback(() => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    chunkBufferRef.current = [];
    samplesAccumulatedRef.current = 0;
    setIsRecording(false);
    onVolumeChange?.(0, false);
  }, [onVolumeChange]);

  const start = useCallback(async () => {
    try {
      setError(null);
      stop(); // Clear any existing stream

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setHasPermission(true);
      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // Buffer size 4096 gives ~0.25s per callback at 16kHz
      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;

      chunkBufferRef.current = [];
      samplesAccumulatedRef.current = 0;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(inputData);
        
        // Calculate volume for visual feedback
        const volume = computeRmsVolume(copy);
        const isSpeaking = volume > 0.04;
        onVolumeChange?.(volume, isSpeaking);

        chunkBufferRef.current.push(copy);
        samplesAccumulatedRef.current += copy.length;

        if (samplesAccumulatedRef.current >= samplesPerChunk) {
          // Merge chunks
          const merged = new Float32Array(samplesAccumulatedRef.current);
          let offset = 0;
          for (const piece of chunkBufferRef.current) {
            merged.set(piece, offset);
            offset += piece.length;
          }

          onAudioChunk?.(merged);
          chunkBufferRef.current = [];
          samplesAccumulatedRef.current = 0;
        }
      };

      source.connect(processor);
      // Connect to a mute destination to keep audio graph alive
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone capture error:', err);
      setHasPermission(false);
      setError(err.message || 'Could not access microphone.');
      setIsRecording(false);
    }
  }, [stop, onAudioChunk, onVolumeChange, samplesPerChunk]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isRecording,
    hasPermission,
    error,
    start,
    stop,
  };
}
