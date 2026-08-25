import React from 'react';

interface StatusPillProps {
  status: 'active' | 'success' | 'warning' | 'error' | 'neutral';
  label: string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label, className = '' }) => {
  const styles = {
    active: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/10 text-red-400 border-red-500/30',
    neutral: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  const dots = {
    active: 'bg-blue-400 animate-pulse',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    error: 'bg-red-400 animate-ping',
    neutral: 'bg-slate-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      <span>{label}</span>
    </span>
  );
};
