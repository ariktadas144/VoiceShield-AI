"use client";

import { RiskLevel } from "@/types/risk";
import { RISK_COLORS } from "@/lib/constants";

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const color = RISK_COLORS[level] || RISK_COLORS.Low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider border uppercase ${color.bg} ${color.text} ${color.border}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
      <span>{level} Severity</span>
    </span>
  );
}
