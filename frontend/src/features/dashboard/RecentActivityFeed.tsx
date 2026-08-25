import React from 'react';
import { ActivityItem } from './api';
import { formatRelativeTime } from '../../lib/formatters';
import { ShieldAlert, ShieldCheck, FileWarning, PhoneCall, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface RecentActivityFeedProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  activities = [],
  isLoading = false,
}) => {
  const getIcon = (type: ActivityItem['type'], score: number) => {
    switch (type) {
      case 'HIGH_RISK_FLAG':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'INCIDENT_FILED':
        return <FileWarning className="w-4 h-4 text-orange-400" />;
      case 'SECONDARY_AUTH_SUCCESS':
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      default:
        return <PhoneCall className="w-4 h-4 text-blue-400" />;
    }
  };

  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-slate-900/50 animate-pulse" />;
  }

  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 tracking-wide">
            Live Stream Activity Log
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time biometric inspection triggers
          </p>
        </div>
        <Link
          to="/incidents"
          className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
        >
          View Full Audit Log &rarr;
        </Link>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-1">
        {activities.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/60 transition-colors"
          >
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0 mt-0.5">
              {getIcon(item.type, item.riskScore)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-200 truncate">
                  {item.title}
                </span>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                {item.description}
              </p>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                  item.riskScore > 75
                    ? 'text-red-400 bg-red-500/10 border-red-500/30'
                    : item.riskScore > 30
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                {item.riskScore}/100
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
