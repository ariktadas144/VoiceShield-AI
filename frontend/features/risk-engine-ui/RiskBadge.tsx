import React from 'react';
import { RiskLevel } from '@/types/risk';
import { getRiskTheme } from './riskLevel';
import { ShieldAlert, AlertTriangle, ShieldCheck, AlertCircle } from 'lucide-react';

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export default function RiskBadge({
  level,
  size = 'md',
  showIcon = true,
  className = '',
}: RiskBadgeProps) {
  const theme = getRiskTheme(level);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3.5 py-1.5 gap-2 font-bold',
  }[size];

  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  const IconComponent = () => {
    switch (level) {
      case 'Critical':
        return <ShieldAlert className={iconSize} />;
      case 'High':
        return <AlertTriangle className={iconSize} />;
      case 'Medium':
        return <AlertCircle className={iconSize} />;
      case 'Low':
      default:
        return <ShieldCheck className={iconSize} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border uppercase tracking-wider transition-all duration-300 ${theme.badge} ${sizeClasses} ${className}`}
    >
      {showIcon && <IconComponent />}
      <span>{level} Risk</span>
    </span>
  );
}
