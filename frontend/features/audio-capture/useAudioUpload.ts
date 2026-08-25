"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { blobToBase64, sliceFileIntoChunks } from "./audioChunker";
import { CHUNK_DURATION_MS } from "@/lib/constants";

interface UseAudioUploadOptions {
  onChunkAvailable: (base64Audio: string, seq: number) => void;
  onComplete?: () => void;
  onError?: (err: string) => void;
}

export function useAudioUpload({
  onChunkAvailable,
  onComplete,
  onError,
}: UseAudioUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0); // 0 - 100
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const seqRef = useRef(0);

  const stopUpload = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsUploading(false);
    setProgress(0);
  }, []);

  const startUpload = useCallback(
    async (file: File) => {
      if (!file) {
        if (onError) onError("No audio file selected.");
        return;
      }

      stopUpload();
      setSelectedFile(file);
      setIsUploading(true);
      seqRef.current = 0;

      // Approximate chunk size based on file size assuming ~30 second total audio duration
      const totalEstimatedChunks = 10;
      const chunkSize = Math.max(1024 * 16, Math.floor(file.size / totalEstimatedChunks));
      const chunks = sliceFileIntoChunks(file, chunkSize);

      let currentIdx = 0;

      const sendNextChunk = async () => {
        if (currentIdx >= chunks.length) {
          stopUpload();
          if (onComplete) onComplete();
          return;
        }

        const chunkBlob = chunks[currentIdx];
        seqRef.current += 1;
        currentIdx += 1;

        const base64 = await blobToBase64(chunkBlob);
        onChunkAvailable(base64, seqRef.current);
        setProgress(Math.round((currentIdx / chunks.length) * 100));
      };

      // Send first chunk immediately
      await sendNextChunk();

      // Emit subsequent chunks on the 3-second cadence
      intervalRef.current = setInterval(() => {
        sendNextChunk();
      }, CHUNK_DURATION_MS);
    },
    [onChunkAvailable, onComplete, onError, stopUpload]
  );

  useEffect(() => {
    return () => stopUpload();
  }, [stopUpload]);

  return {
    isUploading,
    selectedFile,
    progress,
    setSelectedFile,
    startUpload,
    stopUpload,
  };
}
