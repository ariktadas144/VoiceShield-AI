'use client';

import React from 'react';
import { Search, Filter } from 'lucide-react';
import { IncidentFilters as FilterType, IncidentStatus } from '@/types/incident';
import { RiskLevel } from '@/types/risk';

interface IncidentFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
}

export default function IncidentFilters({ filters, onChange }: IncidentFiltersProps) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Search box */}
      <div className="relative w-full md:w-80">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search by caller, identity, or ID..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Filter selectors */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400 font-medium">Risk:</span>
          <select
            value={filters.riskLevel || 'ALL'}
            onChange={(e) => onChange({ ...filters, riskLevel: e.target.value as RiskLevel | 'ALL' })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Levels</option>
            <option value="Critical">Critical Only</option>
            <option value="High">High Only</option>
            <option value="Medium">Medium Only</option>
            <option value="Low">Low Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <select
            value={filters.status || 'ALL'}
            onChange={(e) => onChange({ ...filters, status: e.target.value as IncidentStatus | 'ALL' })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="FALSE_POSITIVE">False Positive</option>
          </select>
        </div>
      </div>
    </div>
  );
}
