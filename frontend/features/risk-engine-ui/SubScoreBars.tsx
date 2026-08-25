'use client';

import React from 'react';
import { Activity, Fingerprint, AudioWaveform } from 'lucide-react';
import { formatScore } from '@/lib/formatters';

interface SubScoreBarsProps {
  deepfakeProbability: number; // 0 to 100
  speakerScore: number;        // 0 to 100
  anomalyScore: number;        // 0 to 100
  isEnrolled?: boolean;
  className?: string;
}

export default function SubScoreBars({
  deepfakeProbability,
  speakerScore,
  anomalyScore,
  isEnrolled = true,
  className = '',
}: SubScoreBarsProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className}`}>
      {/* 1. Deepfake Probability */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Deepfake Confidence</span>
          </div>
          <span className="text-xl font-bold font-mono text-cyan-400">
            {formatScore(deepfakeProbability)}
          </span>
        </div>

        <div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                deepfakeProbability > 70
                  ? 'bg-red-500'
                  : deepfakeProbability > 40
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, deepfakeProbability))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1.5">
            <span>Synthetic speech probability</span>
            <span>{deepfakeProbability > 60 ? 'HIGH RISK' : 'AUTHENTIC'}</span>
          </div>
        </div>
      </div>

      {/* 2. Speaker Verification Match */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Fingerprint className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Speaker Match</span>
          </div>
          <span
            className={`text-xl font-bold font-mono ${
              !isEnrolled
                ? 'text-slate-400'
                : speakerScore > 75
                ? 'text-emerald-400'
                : speakerScore > 50
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {isEnrolled ? formatScore(speakerScore) : 'N/A'}
          </span>
        </div>

        <div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                !isEnrolled
                  ? 'bg-slate-600'
                  : speakerScore > 75
                  ? 'bg-emerald-500'
                  : speakerScore > 50
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${isEnrolled ? Math.min(100, Math.max(0, speakerScore)) : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1.5">
            <span>{isEnrolled ? 'Enrolled Voiceprint Vector' : 'No Enrolled Profile'}</span>
            <span>{isEnrolled ? (speakerScore > 75 ? 'CONFIRMED' : 'MISMATCH') : 'UNREGISTERED'}</span>
          </div>
        </div>
      </div>

      {/* 3. Acoustic/Prosody Anomaly */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400">
              <AudioWaveform className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Prosody Anomaly</span>
          </div>
          <span className="text-xl font-bold font-mono text-pink-400">
            {formatScore(anomalyScore)}
          </span>
        </div>

        <div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                anomalyScore > 65
                  ? 'bg-red-500'
                  : anomalyScore > 35
                  ? 'bg-amber-500'
                  : 'bg-pink-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, anomalyScore))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1.5">
            <span>Pitch contour &amp; jitter analysis</span>
            <span>{anomalyScore > 50 ? 'UNNATURAL' : 'ORGANIC'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
