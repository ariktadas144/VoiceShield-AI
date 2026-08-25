'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useDashboardSummary, useRecentActivity } from '@/features/dashboard/api';
import { useIncidents } from '@/features/incidents/api';
import SummaryCards from '@/features/dashboard/SummaryCards';
import RecentActivityFeed from '@/features/dashboard/RecentActivityFeed';
import RiskDistributionChart from '@/features/dashboard/RiskDistributionChart';
import IncidentTable from '@/features/incidents/IncidentTable';
import IncidentDetailDrawer from '@/features/incidents/IncidentDetailDrawer';
import { Incident } from '@/types/incident';
import { Radio, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function DashboardPage() {
  const { data: summary, isLoading: isSummaryLoading } = useDashboardSummary();
  const { data: activities, isLoading: isActivitiesLoading } = useRecentActivity();
  const { data: incidents, isLoading: isIncidentsLoading } = useIncidents();

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Take the 4 most recent incidents for the dashboard table
  const recentIncidents = incidents ? incidents.slice(0, 4) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero Action CTA Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold uppercase tracking-wider mb-3">
              <Zap className="w-3.5 h-3.5" />
              Real-Time Synthetic Speech Defense
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              Defend Your Organization Against Executive Voice Clones
            </h1>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              Analyze live incoming audio on a continuous 3-second stream cadence. Multi-signal AI fuses deepfake detection, speaker voiceprint verification, and acoustic prosody to thwart social engineering before fraud occurs.
            </p>
          </div>

          <Link
            href="/live-verification"
            className="px-6 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:via-purple-500 hover:to-cyan-400 text-white font-bold text-sm flex items-center gap-3 shadow-xl shadow-indigo-950/60 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0"
          >
            <Radio className="w-5 h-5 animate-pulse text-cyan-200" />
            <span>Start Live Verification</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} isLoading={isSummaryLoading} />

      {/* Charts & Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RiskDistributionChart
            distribution={summary?.riskDistribution}
            isLoading={isSummaryLoading}
          />
        </div>
        <div className="lg:col-span-1">
          <RecentActivityFeed
            activities={activities}
            isLoading={isActivitiesLoading}
          />
        </div>
      </div>

      {/* Recent Incidents Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Recent Flagged Security Incidents
            </h3>
            <p className="text-xs text-slate-400">
              Live cases evaluated by VoiceShield intelligence engine
            </p>
          </div>

          <Link
            href="/incidents"
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            View Full Incident History
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <IncidentTable
          incidents={recentIncidents}
          isLoading={isIncidentsLoading}
          onSelectIncident={(incident) => setSelectedIncident(incident)}
        />
      </div>

      {/* Incident Detail Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
