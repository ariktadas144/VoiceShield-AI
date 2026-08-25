'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';

interface SummaryCardsProps {
  summary?: {
    totalVerifications: number;
    highRiskDetections: number;
    incidentsReported: number;
    resolvedIncidents: number;
  };
  isLoading?: boolean;
}

export default function SummaryCards({ summary, isLoading = false }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Total Verifications',
      value: summary?.totalVerifications ?? 142,
      subtitle: '+18% from last week',
      icon: ShieldCheck,
      iconColor: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
    },
    {
      title: 'High-Risk Detections',
      value: summary?.highRiskDetections ?? 12,
      subtitle: '8 blocked in real-time',
      icon: ShieldAlert,
      iconColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
    },
    {
      title: 'Incidents Reported',
      value: summary?.incidentsReported ?? 19,
      subtitle: '3 open security reviews',
      icon: FileText,
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
    {
      title: 'Resolved Incidents',
      value: summary?.resolvedIncidents ?? 16,
      subtitle: '94% resolution rate',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-slate-900/80 border ${card.borderColor} rounded-2xl p-5 shadow-lg relative overflow-hidden transition-transform hover:-translate-y-0.5`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  {card.title}
                </span>
                <span className="text-3xl font-extrabold font-mono text-white">
                  {isLoading ? '...' : card.value}
                </span>
                <span className="text-xs text-slate-400 block mt-1">{card.subtitle}</span>
              </div>
              <div className={`p-3 rounded-2xl ${card.bgColor} ${card.iconColor}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
