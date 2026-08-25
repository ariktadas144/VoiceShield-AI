import React from 'react';
import { ConnectionStatus } from '@/types/session';

interface StatusPillProps {
  status: ConnectionStatus;
  className?: string;
}

export default function StatusPill({ status, className = '' }: StatusPillProps) {
  const configs = {
    connected: {
      label: 'Live Stream Active',
      dotClass: 'bg-emerald-400 animate-ping',
      bgClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    },
    connecting: {
      label: 'Connecting Stream...',
      dotClass: 'bg-amber-400 animate-spin',
      bgClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    },
    disconnected: {
      label: 'System Standby',
      dotClass: 'bg-slate-500',
      bgClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
    },
    error: {
      label: 'Connection Error',
      dotClass: 'bg-red-400',
      bgClass: 'bg-red-500/10 text-red-300 border-red-500/30',
    },
  }[status] || {
    label: 'Offline',
    dotClass: 'bg-slate-500',
    bgClass: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${configs.bgClass} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${configs.dotClass}`} />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
      </span>
      {configs.label}
    </span>
  );
}
