"use client";

import { AlertOctagon, CheckCircle2, Info } from "lucide-react";

interface ActivityItem {
  id: string;
  event: string;
  time: string;
  type: string;
}

export default function RecentActivityFeed({ data }: { data?: ActivityItem[] }) {
  const items = data || [
    {
      id: "ACT-1",
      event: "Critical impersonation attempt blocked for CFO identity.",
      time: "10 mins ago",
      type: "critical",
    },
    {
      id: "ACT-2",
      event: "Live voice verification session initialized by Security Agent.",
      time: "25 mins ago",
      type: "info",
    },
    {
      id: "ACT-3",
      event: "Voice profile updated for CEO Eleanor Vance.",
      time: "2 hours ago",
      type: "success",
    },
    {
      id: "ACT-4",
      event: "Secondary OTP verification succeeded for Incident INC-8744.",
      time: "4 hours ago",
      type: "success",
    },
  ];

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col h-[320px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-200 tracking-wide">
          Recent Activity Feed
        </h2>
        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1 flex-1">
        {items.map((item) => {
          let Icon = Info;
          let iconColor = "text-cyan-400 bg-cyan-950/50 border-cyan-800/40";

          if (item.type === "critical") {
            Icon = AlertOctagon;
            iconColor = "text-rose-400 bg-rose-950/50 border-rose-800/40";
          } else if (item.type === "success") {
            Icon = CheckCircle2;
            iconColor = "text-emerald-400 bg-emerald-950/50 border-emerald-800/40";
          }

          return (
            <div
              key={item.id}
              className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors"
            >
              <div className={`p-1.5 rounded-lg border ${iconColor} shrink-0 mt-0.5`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200 leading-snug">{item.event}</p>
                <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
