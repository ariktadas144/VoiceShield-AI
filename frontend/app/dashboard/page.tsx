"use client";

import Link from "next/link";
import { Mic, ArrowRight, ShieldAlert, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import SummaryCards from "@/features/dashboard/SummaryCards";
import RiskDistributionChart from "@/features/dashboard/RiskDistributionChart";
import RecentActivityFeed from "@/features/dashboard/RecentActivityFeed";
import { useDashboardSummary, useRecentActivity } from "@/features/dashboard/api";
import { useQuery } from "@tanstack/react-query";
import { fetchIncidents } from "@/lib/apiClient";
import { RISK_COLORS } from "@/lib/constants";

export default function DashboardPage() {
  const { data: summaryData } = useDashboardSummary();
  const { data: activityData } = useRecentActivity();
  const { data: incidentsData } = useQuery({
    queryKey: ["recent-incidents"],
    queryFn: fetchIncidents,
  });

  return (
    <div className="space-y-6">
      {/* Hero Welcome & CTA Banner */}
      <div className="glass-panel-glow p-6 rounded-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-cyan-500/30">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">
              Security Ops Console
            </span>
            <span className="text-xs text-slate-400 font-mono">• Active Protection</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Real-time AI Voice Impersonation Defense
          </h1>
          <p className="text-sm text-slate-300">
            Monitor ongoing calls, stream neural speaker verification, and defend your executive communications against deepfake synthetic audio attacks.
          </p>
        </div>

        <Link
          href="/live-verification"
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-950/60 transition-all transform hover:-translate-y-0.5 shrink-0"
        >
          <Mic className="w-4 h-4 animate-pulse" />
          <span>Start Live Verification</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Metric Cards */}
      <SummaryCards data={summaryData} />

      {/* Recharts Distribution & Activity Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskDistributionChart data={summaryData?.distribution} />
        <RecentActivityFeed data={activityData} />
      </div>

      {/* Recent Incidents Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span>Recent Impersonation Incidents</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest flagged audio verification sessions requiring security audit
            </p>
          </div>

          <Link
            href="/incidents"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 hover:underline"
          >
            <span>View All Incidents</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 uppercase text-[10px] font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Incident ID</th>
                <th className="py-3 px-4">Claimed Identity</th>
                <th className="py-3 px-4">Risk Level</th>
                <th className="py-3 px-4">Risk Score</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {(incidentsData || []).slice(0, 4).map((inc) => {
                const colorConfig = RISK_COLORS[inc.riskLevel] || RISK_COLORS.Low;

                return (
                  <tr key={inc.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-cyan-400">{inc.id}</td>
                    <td className="py-3 px-4 text-slate-200 font-sans font-medium">
                      {inc.claimedIdentity}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border}`}
                      >
                        {inc.riskLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold">{inc.riskScore}/100</td>
                    <td className="py-3 px-4">
                      <span className="text-slate-300 font-sans font-medium">{inc.status}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(inc.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
