import React from 'react';
import { getRiskLevelFromScore, getRiskConfig } from './riskLevel';
import { Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

interface RiskGaugeProps {
  score: number;
  size?: number;
  className?: string;
  showLabels?: boolean;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score = 0,
  size = 240,
  className = '',
  showLabels = true,
}) => {
  const clampedScore = Math.min(Math.max(Math.round(score), 0), 100);
  const level = getRiskLevelFromScore(clampedScore);
  const config = getRiskConfig(level);

  // SVG Gauge Calculations (180-degree semi-circle or 240-degree arc)
  const strokeWidth = 14;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;
  
  // 240-degree arc from 150deg to 390deg (or -210 to 30)
  const startAngle = 150;
  const totalAngle = 240;
  const currentAngle = startAngle + (clampedScore / 100) * totalAngle;

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(x, y, r, endA);
    const end = polarToCartesian(x, y, r, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const bgArcPath = describeArc(center, center, radius, startAngle, startAngle + totalAngle);
  const progressArcPath = describeArc(center, center, radius, startAngle, Math.max(startAngle + 0.5, currentAngle));

  const getIcon = () => {
    switch (level) {
      case 'LOW':
        return <ShieldCheck className="w-6 h-6 text-emerald-400" />;
      case 'MEDIUM':
        return <Shield className="w-6 h-6 text-amber-400" />;
      case 'HIGH':
        return <ShieldAlert className="w-6 h-6 text-orange-400" />;
      case 'CRITICAL':
        return <ShieldX className="w-6 h-6 text-red-500 animate-bounce" />;
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center relative ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            {/* Dynamic Glow Filter */}
            <filter id={`gauge-glow-${level}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            {/* Linear Gradient for Track */}
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="35%" stopColor="#f59e0b" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <path
            d={bgArcPath}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Active Colored Arc */}
          <path
            d={progressArcPath}
            fill="none"
            stroke={config.hexColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter={`url(#gauge-glow-${level})`}
            className="transition-all duration-500 ease-out"
          />

          {/* Threshold Tick Marks */}
          {[0, 30, 60, 75, 100].map((val) => {
            const angle = startAngle + (val / 100) * totalAngle;
            const pt1 = polarToCartesian(center, center, radius - strokeWidth / 2 - 4, angle);
            const pt2 = polarToCartesian(center, center, radius + strokeWidth / 2 + 4, angle);
            return (
              <line
                key={val}
                x1={pt1.x}
                y1={pt1.y}
                x2={pt2.x}
                y2={pt2.y}
                stroke="#334155"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {/* Center Score & Info Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
          <div className="mb-1">{getIcon()}</div>
          <div className="flex items-baseline">
            <span
              className="text-5xl font-black tracking-tight font-mono transition-colors duration-300"
              style={{ color: config.hexColor }}
            >
              {clampedScore}
            </span>
            <span className="text-sm font-semibold text-slate-500 ml-1">/100</span>
          </div>
          <div
            className={`mt-1 text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-all duration-300 ${config.badgeBg}`}
          >
            {config.label}
          </div>
        </div>
      </div>

      {showLabels && (
        <div className="w-full flex justify-between px-6 text-[11px] font-semibold text-slate-500 -mt-3">
          <span className="text-emerald-400">0 Safe</span>
          <span className="text-amber-400">30 Caution</span>
          <span className="text-orange-400">60 Elevated</span>
          <span className="text-red-400">75+ Critical</span>
        </div>
      )}
    </div>
  );
};
