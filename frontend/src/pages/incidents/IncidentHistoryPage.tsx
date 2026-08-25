import React, { useState } from 'react';
import { useIncidents } from '../../features/incidents/api';
import { Incident, IncidentFilterOptions } from '../../features/incidents/types';
import { IncidentFilters } from '../../features/incidents/IncidentFilters';
import { IncidentTable } from '../../features/incidents/IncidentTable';
import { IncidentDetailDrawer } from './IncidentDetailDrawer';
import { ShieldAlert, Download, Plus } from 'lucide-react';

export const IncidentHistoryPage: React.FC = () => {
  const [filters, setFilters] = useState<IncidentFilterOptions>({
    status: 'ALL',
    riskLevel: 'ALL',
    searchTerm: '',
  });

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const { data: incidents, isLoading, refetch } = useIncidents(filters);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <span>Incident Forensics & Threat Audit</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Historical log of detected AI voice impersonation attempts and secondary verifications
          </p>
        </div>

        <button
          onClick={() => {
            const jsonStr = JSON.stringify(incidents, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voiceshield-incidents-${Date.now()}.json`;
            a.click();
          }}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log</span>
        </button>
      </div>

      {/* Filters Bar */}
      <IncidentFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={() => refetch()}
        isLoading={isLoading}
      />

      {/* Incidents Table */}
      <IncidentTable
        incidents={incidents || []}
        onSelectIncident={(incident) => setSelectedIncident(incident)}
        isLoading={isLoading}
      />

      {/* Detail Slide-over Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
};
