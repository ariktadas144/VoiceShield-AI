'use client';

import React from 'react';
import { Incident } from '@/types/incident';
import RiskBadge from '@/features/risk-engine-ui/RiskBadge';
import { formatDate } from '@/lib/formatters';
import { ChevronRight, Phone, Shield } from 'lucide-react';

interface IncidentTableProps {
  incidents: Incident[];
  isLoading?: boolean;
  onSelectIncident: (incident: Incident) => void;
}

export default function IncidentTable({
  incidents,
  isLoading = false,
  onSelectIncident,
}: IncidentTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'UNDER_REVIEW':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'RESOLVED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'FALSE_POSITIVE':
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-400 font-mono">
        Loading incidents repository...
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center">
        <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h4 className="text-base font-bold text-slate-200">No Incidents Found</h4>
        <p className="text-xs text-slate-500 mt-1">
          No security events match the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/70 uppercase font-mono text-[11px] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-5 py-4 font-bold">Incident ID</th>
              <th className="px-5 py-4 font-bold">Claimed Identity</th>
              <th className="px-5 py-4 font-bold">Risk Assessment</th>
              <th className="px-5 py-4 font-bold">Timestamp</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                onClick={() => onSelectIncident(incident)}
                className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                <td className="px-5 py-4 font-mono font-bold text-indigo-400">
                  {incident.id}
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-100">{incident.claimedIdentity}</div>
                  {incident.callerNumber && (
                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-500" />
                      {incident.callerNumber}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <RiskBadge level={incident.riskLevel} size="sm" />
                    <span className="font-mono text-xs text-slate-400 font-bold">
                      ({incident.riskScore}/100)
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-slate-400">
                  {formatDate(incident.timestamp)}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(
                      incident.status
                    )}`}
                  >
                    {incident.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <span className="p-1.5 rounded-lg bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-indigo-600 transition-all inline-flex">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
