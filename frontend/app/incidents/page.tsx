'use client';

import React, { useState } from 'react';
import { useIncidents } from '@/features/incidents/api';
import IncidentFilters from '@/features/incidents/IncidentFilters';
import IncidentTable from '@/features/incidents/IncidentTable';
import IncidentDetailDrawer from '@/features/incidents/IncidentDetailDrawer';
import { Incident, IncidentFilters as FilterType } from '@/types/incident';
import { History, ShieldAlert } from 'lucide-react';

export default function IncidentHistoryPage() {
  const [filters, setFilters] = useState<FilterType>({
    status: 'ALL',
    riskLevel: 'ALL',
    search: '',
  });

  const { data: incidents, isLoading } = useIncidents(filters);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <History className="w-7 h-7 text-indigo-400" />
            Security Incident Repository
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical catalog of synthetic voice threats, spoofed calls, and out-of-band challenge logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="text-xs font-mono font-bold text-white">
              {incidents ? incidents.length : 0} Logged Incidents
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <IncidentFilters filters={filters} onChange={setFilters} />

      {/* Incidents Table */}
      <IncidentTable
        incidents={incidents || []}
        isLoading={isLoading}
        onSelectIncident={(incident) => setSelectedIncident(incident)}
      />

      {/* Incident Detail Slide-Over Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
