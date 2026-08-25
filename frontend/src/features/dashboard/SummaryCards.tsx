import React from 'react';
import { ShieldCheck, ShieldAlert, FileWarning, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { DashboardSummary } from './api';

interface SummaryCardsProps {
  summary?: DashboardSummary;
  isLoading?: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, isLoading }) => {
  const cards = [
    {
      title: 'Total Scanned Audio',
      value: summary?.totalVerifications?.toLocaleString() ?? '1,248',
      change: '+14% vs last week',
      trend: 'up',
      icon: ShieldCheck,
      iconColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    {
      title: 'High Risk Detections',
      value: summary?.highRiskDetections?.toLocaleString() ?? '42',
      change: '-5% vs last week',
      trend: 'down',
      icon: ShieldAlert,
      iconColor: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    },
    {
      title: 'Incidents Reported',
      value: summary?.incidentsReported?.toLocaleString() ?? '19',
      change: '2 pending review',
      trend: 'neutral',
      icon: FileWarning,
      iconColor: 'text-red-400 bg-red-500/10 border-red-500/20',
    },
    {
      title: 'Threats Intercepted',
      value: summary?.resolvedIncidents?.toLocaleString() ?? '17',
      change: summary?.protectedValueEstimated ? `${summary.protectedValueEstimated} protected` : '94% resolution',
      trend: 'up',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-panel p-5 rounded-2xl relative overflow-hidden transition-all duration-200 hover:border-slate-700/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                {card.title}
              </span>
              <div className={`p-2.5 rounded-xl border ${card.iconColor}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight font-mono text-slate-100">
                {card.value}
              </span>
            </div>

            <div className="mt-2 flex items-center text-xs text-slate-400">
              {card.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mr-1" />}
              {card.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-amber-400 mr-1" />}
              <span className="text-[11px] font-medium">{card.change}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
