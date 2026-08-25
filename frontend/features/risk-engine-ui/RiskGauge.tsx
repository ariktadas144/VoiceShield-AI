'use client';

import React from 'react';
import { RiskLevel } from '@/types/risk';
import { getRiskTheme } from './riskLevel';

interface RiskGaugeProps {
  score: number;       // 0 to 100
  level: RiskLevel;
  className?: string;
}

export default function RiskGauge({ score, level, className = '' }: RiskGaugeProps) {
  const theme = getRiskTheme(level);
  const clampedScore = Math.max(0, Math.min(100, score));

  // Needle angle: -90 degrees (score=0) to +90 degrees (score=100)
  const needleAngle = -90 + (clampedScore / 100) * 180;

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <div className="relative w-64 h-36 flex items-end justify-center overflow-hidden">
        {/* SVG Semi-Circle Gauge */}
        <svg
          viewBox="0 0 200 110"
          className="w-full h-full drop-shadow-md"
        >
          <defs>
            <linearGradient id="gaugeTrackGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />    {/* Low: Green */}
              <stop offset="35%" stopColor="#f59e0b" />   {/* Medium: Amber */}
              <stop offset="70%" stopColor="#f97316" />   {/* High: Orange */}
              <stop offset="100%" stopColor="#ef4444" />  {/* Critical: Red */}
            </linearGradient>
            <filter id="gaugeGlow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Arc Track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Colored Risk Spectrum Arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeTrackGradient)"
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Tick markers */}
          <line x1="20" y1="100" x2="28" y2="100" stroke="#64748b" strokeWidth="2" />
          <line x1="68" y1="44" x2="74" y2="50" stroke="#64748b" strokeWidth="2" />
          <line x1="100" y1="20" x2="100" y2="28" stroke="#64748b" strokeWidth="2" />
          <line x1="132" y1="44" x2="126" y2="50" stroke="#64748b" strokeWidth="2" />
          <line x1="180" y1="100" x2="172" y2="100" stroke="#64748b" strokeWidth="2" />

          {/* Pivot Center Point */}
          <circle cx="100" cy="100" r="10" fill="#0f172a" stroke="#475569" strokeWidth="3" />
          <circle cx="100" cy="100" r="4" fill={theme.hex} />

          {/* Needle */}
          <g
            style={{
              transformOrigin: '100px 100px',
              transform: `rotate(${needleAngle}deg)`,
              transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <polygon
              points="97,100 103,100 101,28 99,28"
              fill={theme.hex}
              filter="url(#gaugeGlow)"
            />
          </g>
        </svg>
      </div>

      {/* Numerical readout */}
      <div className="text-center mt-1">
        <div className="flex items-baseline justify-center gap-1">
          <span
            className="text-5xl font-black font-mono tracking-tight transition-colors duration-300"
            style={{ color: theme.hex }}
          >
            {clampedScore}
          </span>
          <span className="text-slate-500 font-mono text-xl font-bold">/ 100</span>
        </div>
        <div className="text-xs uppercase font-bold tracking-widest text-slate-400 mt-0.5">
          Real-Time Risk Score
        </div>
      </div>
    </div>
  );
}
