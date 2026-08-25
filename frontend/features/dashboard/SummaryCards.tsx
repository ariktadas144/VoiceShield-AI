"use client";

import { ShieldCheck, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";

interface SummaryData {
  totalVerifications: number;
  highRiskDetections: number;
  incidentsReported: number;
  resolvedIncidents: number;
}

export default function SummaryCards({ data }: { data?: SummaryData }) {
  const cards = [
    {
      title: "Total Verifications",
      value: data?.totalVerifications?.toLocaleString() || "1,284",
      change: "+12.4% vs last week",
      icon: ShieldCheck,
      color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-400",
      iconBg: "bg-blue-500/20 text-blue-400",
    },
    {
      title: "High-Risk Detections",
      value: data?.highRiskDetections?.toLocaleString() || "42",
      change: "3 critical flags today",
      icon: AlertTriangle,
      color: "from-rose-500/20 to-orange-500/10 border-rose-500/30 text-rose-400",
      iconBg: "bg-rose-500/20 text-rose-400",
    },
    {
      title: "Incidents Reported",
      value: data?.incidentsReported?.toLocaleString() || "18",
      change: "4 pending review",
      icon: FileText,
      color: "from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-400",
      iconBg: "bg-amber-500/20 text-amber-400",
    },
    {
      title: "Resolved Incidents",
      value: data?.resolvedIncidents?.toLocaleString() || "15",
      change: "83.3% resolution rate",
      icon: CheckCircle2,
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400",
      iconBg: "bg-emerald-500/20 text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`glass-card p-5 rounded-2xl border bg-gradient-to-br ${card.color} flex flex-col justify-between relative overflow-hidden group`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                {card.title}
              </span>
              <div className={`p-2.5 rounded-xl ${card.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">{card.change}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
