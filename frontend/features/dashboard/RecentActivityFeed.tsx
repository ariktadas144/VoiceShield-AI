'use client';

import React from 'react';
import { ShieldAlert, ShieldCheck, KeyRound, Fingerprint, Clock } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  riskScore?: number | null;
  riskLevel?: string | null;
}

interface RecentActivityFeedProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
}

export default function RecentActivityFeed({ activities = [], isLoading = false }: RecentActivityFeedProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'INCIDENT_FLAGGED':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'SECONDARY_VERIFY':
        return <KeyRound className="w-4 h-4 text-amber-400" />;
      case 'ENROLLMENT_UPDATED':
        return <Fingerprint className="w-4 h-4 text-cyan-400" />;
      case 'VERIFICATION_PASSED':
      default:
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Recent Security Activity
        </h3>
        <span className="text-xs font-mono text-slate-400">Live Feed</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-8">
          Loading live security events...
        </div>
      ) : activities.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-8">
          No security events recorded.
        </div>
      ) : (
        <div className="space-y-3.5 flex-1 overflow-y-auto max-h-80 pr-1">
          {activities.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl transition-all flex items-start gap-3"
            >
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0 mt-0.5">
                {getIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200 truncate">{item.title}</span>
                  {item.riskScore !== null && item.riskScore !== undefined && (
                    <span
                      className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                        item.riskScore > 75
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : item.riskScore > 60
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {item.riskScore}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-2">
                  {item.description}
                </p>
                <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                  {formatDate(item.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
