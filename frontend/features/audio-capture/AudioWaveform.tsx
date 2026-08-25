'use client';

import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  className?: string;
}

export default function AudioWaveform({ analyserNode, isActive, className = '' }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (analyserNode && isActive) {
        analyserNode.getByteFrequencyData(dataArray);
      }

      const barCount = 28;
      const gap = 3;
      const totalGaps = (barCount - 1) * gap;
      const barWidth = (width - totalGaps) / barCount;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 4;

        if (isActive) {
          if (analyserNode) {
            const dataIndex = Math.floor((i / barCount) * (bufferLength / 2));
            const value = dataArray[dataIndex] || 0;
            barHeight = Math.max(4, (value / 255) * (height - 8));
          } else {
            // Simulated subtle wave if no analyser
            const time = Date.now() / 200;
            const wave = Math.sin(time + i * 0.4) * 0.5 + 0.5;
            barHeight = Math.max(4, wave * (height * 0.7));
          }
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Gradient styling
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#38bdf8'); // cyan-400
        gradient.addColorStop(0.5, '#818cf8'); // indigo-400
        gradient.addColorStop(1, '#c084fc'); // purple-400

        ctx.fillStyle = isActive ? gradient : '#334155';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyserNode, isActive]);

  return (
    <div className={`relative flex items-center justify-center bg-slate-950/70 border border-slate-800 rounded-xl p-3 ${className}`}>
      <canvas
        ref={canvasRef}
        width={320}
        height={48}
        className="w-full h-12 block"
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-xs font-mono text-slate-500 uppercase tracking-widest pointer-events-none">
          Audio Feed Inactive
        </div>
      )}
    </div>
  );
}
