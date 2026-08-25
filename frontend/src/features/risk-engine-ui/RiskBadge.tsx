import React from 'react';
import { RiskLevel } from '../../types/risk';
import { getRiskConfig } from './riskLevel';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  score,
  showScore = false,
  size = 'md',
  className = '',
}) => {
  const config = getRiskConfig(level);

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 font-semibold',
    md: 'text-xs px-2.5 py-1 font-bold',
    lg: 'text-sm px-3.5 py-1.5 font-extrabold',
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border uppercase tracking-wider transition-all duration-200 ${
        config.badgeBg
      } ${config.glowClass} ${sizeClasses[size]} ${className}`}
    >
      <span
        className={`rounded-full ${dotSizes[size]} animate-pulse`}
        style={{ backgroundColor: config.hexColor }}
      />
      <span>{config.label}</span>
      {showScore && score !== undefined && (
        <span className="font-mono ml-0.5 opacity-90 font-black">({score})</span>
      )}
    </span>
  );
};
