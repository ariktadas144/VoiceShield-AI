import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardSummary, useRecentActivity } from '../../features/dashboard/api';
import { useIncidents } from '../../features/incidents/api';
import { SummaryCards } from '../../features/dashboard/SummaryCards';
import { RiskDistributionChart } from '../../features/dashboard/RiskDistributionChart';
import { RecentActivityFeed } from '../../features/dashboard/RecentActivityFeed';
import { IncidentTable } from '../../features/incidents/IncidentTable';
import { Radio, ShieldAlert, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: summary, isLoading: isSummaryLoading } = useDashboardSummary();
  const { data: activities, isLoading: isActivitiesLoading } = useRecentActivity();
  const { data: incidents, isLoading: isIncidentsLoading } = useIncidents({ status: 'ALL' });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Action Banner */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-indigo-950/80 border border-blue-500/30 shadow-2xl shadow-blue-950/30">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>AI Voice Impersonation Defense</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            Protect against synthetic voice cloning in real-time.
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed font-medium">
            Continuous acoustic & vocoder inspection monitors incoming voice calls for neural deepfake artifacts and executive identity impersonation.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/live-verification')}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 transition-all cursor-pointer"
            >
              <Radio className="w-4 h-4" />
              <span>Start Live Verification</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            <button
              onClick={() => navigate('/enrollment')}
              className="px-5 py-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-sm transition-all cursor-pointer"
            >
              <span>Manage Voice Profiles</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <SummaryCards summary={summary} isLoading={isSummaryLoading} />

      {/* Charts & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskDistributionChart
          distribution={summary?.riskDistribution}
          isLoading={isSummaryLoading}
        />
        <RecentActivityFeed
          activities={activities}
          isLoading={isActivitiesLoading}
        />
      </div>

      {/* Recent Incidents Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 tracking-wide">
              Recent Security Incidents
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              High-priority voice impersonation intercepts requiring review
            </p>
          </div>

          <button
            onClick={() => navigate('/incidents')}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
          >
            <span>View All Incidents</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <IncidentTable
          incidents={(incidents || []).slice(0, 4)}
          onSelectIncident={() => navigate('/incidents')}
          isLoading={isIncidentsLoading}
        />
      </div>
    </div>
  );
};
