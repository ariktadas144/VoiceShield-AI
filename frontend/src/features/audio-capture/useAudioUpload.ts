import { useState, useRef, useCallback, useEffect } from 'react';
import { resampleAudioBuffer, slicePcmChunks, computeRmsVolume, TARGET_SAMPLE_RATE } from './audioChunker';

export interface UseAudioUploadOptions {
  onAudioChunk?: (pcmChunk: Float32Array) => void;
  onVolumeChange?: (volume: number, isSpeaking: boolean) => void;
  onPlaybackComplete?: () => void;
  chunkDurationMs?: number; // default 500ms
}

export function useAudioUpload({
  onAudioChunk,
  onVolumeChange,
  onPlaybackComplete,
  chunkDurationMs = 500,
}: UseAudioUploadOptions = {}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const playbackTimerRef = useRef<number | null>(null);
  const currentChunkIndexRef = useRef<number>(0);
  const chunksRef = useRef<Float32Array[]>([]);

  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
    onVolumeChange?.(0, false);
  }, [onVolumeChange]);

  const loadFile = useCallback(async (file: File) => {
    try {
      setError(null);
      stopPlayback();
      setSelectedFile(file);
      setIsDecoding(true);

      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setTotalDuration(decodedBuffer.duration);

      const resampledPcm = resampleAudioBuffer(decodedBuffer, TARGET_SAMPLE_RATE);
      const chunkSeconds = chunkDurationMs / 1000;
      const chunks = slicePcmChunks(resampledPcm, chunkSeconds, TARGET_SAMPLE_RATE);
      
      chunksRef.current = chunks;
      currentChunkIndexRef.current = 0;
      setProgress(0);
      setIsDecoding(false);
      
      await audioCtx.close();
    } catch (err: any) {
      console.error('Failed to load/decode audio file:', err);
      setError(err.message || 'Failed to decode audio file.');
      setIsDecoding(false);
    }
  }, [stopPlayback, chunkDurationMs]);

  const startPlayback = useCallback(() => {
    if (chunksRef.current.length === 0) {
      setError('No audio file loaded.');
      return;
    }

    stopPlayback();
    setIsPlaying(true);
    currentChunkIndexRef.current = 0;

    playbackTimerRef.current = window.setInterval(() => {
      const index = currentChunkIndexRef.current;
      const total = chunksRef.current.length;

      if (index >= total) {
        stopPlayback();
        setProgress(100);
        onPlaybackComplete?.();
        return;
      }

      const chunk = chunksRef.current[index];
      const volume = computeRmsVolume(chunk);
      const isSpeaking = volume > 0.03;

      onVolumeChange?.(volume, isSpeaking);
      onAudioChunk?.(chunk);

      currentChunkIndexRef.current = index + 1;
      setProgress(Math.round(((index + 1) / total) * 100));
    }, chunkDurationMs);
  }, [stopPlayback, onVolumeChange, onAudioChunk, onPlaybackComplete, chunkDurationMs]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  return {
    selectedFile,
    isPlaying,
    isDecoding,
    progress,
    totalDuration,
    error,
    loadFile,
    startPlayback,
    stopPlayback,
  };
}
