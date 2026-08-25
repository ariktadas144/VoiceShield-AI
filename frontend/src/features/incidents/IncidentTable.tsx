import React from 'react';
import { Incident, IncidentStatus } from './types';
import { RiskBadge } from '../risk-engine-ui/RiskBadge';
import { formatTimestamp, formatRelativeTime } from '../../lib/formatters';
import { ChevronRight, ShieldAlert, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface IncidentTableProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  isLoading?: boolean;
}

export const IncidentTable: React.FC<IncidentTableProps> = ({
  incidents,
  onSelectIncident,
  isLoading = false,
}) => {
  const getStatusChip = (status: IncidentStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Open
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
            <Clock className="w-3 h-3" />
            Reviewing
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        );
      case 'FALSE_POSITIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/30 uppercase tracking-wider">
            <AlertCircle className="w-3 h-3" />
            False Pos
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-700 text-slate-300 uppercase tracking-wider">
            {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-8 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-slate-900/60 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3">
        <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/60">
          <ShieldAlert className="w-8 h-8 text-slate-400" />
        </div>
        <h4 className="text-base font-bold text-slate-200">No Incidents Found</h4>
        <p className="text-xs text-slate-400 max-w-sm">
          No security events match the selected filters. All monitored voice sessions are operating within secure thresholds.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800/80">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-bold">
            <tr>
              <th className="py-3.5 px-4">Incident ID</th>
              <th className="py-3.5 px-4">Target Identity</th>
              <th className="py-3.5 px-4">Risk Severity</th>
              <th className="py-3.5 px-4">Timestamp</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                onClick={() => onSelectIncident(incident)}
                className="hover:bg-slate-900/50 transition-colors cursor-pointer group"
              >
                <td className="py-3.5 px-4 font-mono font-bold text-blue-400 group-hover:text-blue-300">
                  {incident.id}
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-bold text-slate-200">
                    {incident.claimedIdentityName}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {incident.claimedIdentityRole} • {incident.claimedIdentityDepartment}
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <RiskBadge
                    level={incident.peakRiskLevel}
                    score={incident.peakRiskScore}
                    showScore={true}
                    size="sm"
                  />
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-400">
                  <div>{formatTimestamp(incident.timestamp)}</div>
                  <div className="text-[10px] text-slate-500">
                    {formatRelativeTime(incident.timestamp)}
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  {getStatusChip(incident.status)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="inline-flex items-center text-slate-400 group-hover:text-slate-100 transition-colors">
                    <span className="text-[11px] font-semibold mr-1">Inspect</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
