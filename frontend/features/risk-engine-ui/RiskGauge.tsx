"use client";

import { RISK_COLORS, getRiskLevel } from "@/lib/constants";
import { RiskLevel } from "@/types/risk";

export default function RiskGauge({ score = 0 }: { score?: number }) {
  const safeScore = Math.min(100, Math.max(0, score));
  const level: RiskLevel = getRiskLevel(safeScore);
  const color = RISK_COLORS[level];

  // SVG Gauge calculations (semi-circle arc)
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // 180 deg arc
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative p-4">
      <div className="relative w-[220px] h-[125px] flex items-center justify-center overflow-hidden">
        <svg className="w-[200px] h-[200px] -rotate-180 transform" viewBox="0 0 200 200">
          {/* Background Arc */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset="0"
            strokeLinecap="round"
          />

          {/* Value Arc */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={color.hex}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
            style={{
              filter: `drop-shadow(0 0 8px ${color.glow})`,
            }}
          />
        </svg>

        {/* Center Score & Level Text */}
        <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-4xl font-extrabold font-mono text-white tracking-tight">
            {safeScore}
          </div>
          <div
            className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded mt-0.5 ${color.bg} ${color.text} ${color.border} border`}
          >
            {level} Risk
          </div>
        </div>
      </div>
    </div>
  );
}
