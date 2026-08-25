'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { CHUNK_INTERVAL_MS } from '@/lib/constants';
import { arrayBufferToBase64 } from './audioChunker';

interface UseAudioUploadOptions {
  onAudioChunk: (base64Audio: string, seq: number) => void;
  intervalMs?: number;
}

export function useAudioUpload({
  onAudioChunk,
  intervalMs = CHUNK_INTERVAL_MS,
}: UseAudioUploadOptions) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const fileArrayBufferRef = useRef<ArrayBuffer | null>(null);
  const seqCounterRef = useRef(0);
  const chunkByteSizeRef = useRef(0);

  const stop = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }

    setIsPlaying(false);
    setProgress(0);
    seqCounterRef.current = 0;
  }, []);

  const selectFile = useCallback((file: File) => {
    stop();
    setSelectedFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      fileArrayBufferRef.current = reader.result as ArrayBuffer;
    };
    reader.readAsArrayBuffer(file);
  }, [stop]);

  const start = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select an audio file first.');
      return;
    }

    stop();
    setError(null);
    seqCounterRef.current = 0;

    try {
      if (!audioContextRef.current) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtxClass();
      }

      if (!audioElementRef.current) {
        const audio = new Audio();
        audioElementRef.current = audio;
        const source = audioContextRef.current.createMediaElementSource(audio);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContextRef.current.destination);
        setAnalyserNode(analyser);
      }

      const audioUrl = URL.createObjectURL(selectedFile);
      audioElementRef.current.src = audioUrl;
      
      // Calculate estimated chunk byte size for 3 seconds of audio based on file length
      const totalBytes = selectedFile.size;
      
      audioElementRef.current.onloadedmetadata = () => {
        const durationSecs = audioElementRef.current?.duration || 30;
        const bytesPerSec = totalBytes / Math.max(durationSecs, 1);
        chunkByteSizeRef.current = Math.floor(bytesPerSec * (intervalMs / 1000));
      };

      audioElementRef.current.ontimeupdate = () => {
        if (audioElementRef.current && audioElementRef.current.duration) {
          const current = (audioElementRef.current.currentTime / audioElementRef.current.duration) * 100;
          setProgress(Math.min(100, Math.round(current)));
        }
      };

      audioElementRef.current.onended = () => {
        stop();
      };

      await audioElementRef.current.play();
      setIsPlaying(true);

      // Slicing and sending audio chunks on the same 3-second interval
      intervalIdRef.current = setInterval(async () => {
        if (!fileArrayBufferRef.current) return;
        
        seqCounterRef.current += 1;
        const seq = seqCounterRef.current;
        const chunkSize = chunkByteSizeRef.current || Math.floor(fileArrayBufferRef.current.byteLength / 10);
        const startOffset = Math.min(((seq - 1) * chunkSize) % fileArrayBufferRef.current.byteLength, fileArrayBufferRef.current.byteLength - 1000);
        const endOffset = Math.min(startOffset + chunkSize, fileArrayBufferRef.current.byteLength);

        const slice = fileArrayBufferRef.current.slice(startOffset, endOffset);
        const base64 = await arrayBufferToBase64(slice);
        onAudioChunk(base64, seq);
      }, intervalMs);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to play uploaded audio sample.';
      setError(msg);
      setIsPlaying(false);
    }
  }, [selectedFile, stop, intervalMs, onAudioChunk]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    selectFile,
    selectedFile,
    start,
    stop,
    isPlaying,
    progress,
    analyserNode,
    error,
  };
}
