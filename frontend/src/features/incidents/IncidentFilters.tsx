import React from 'react';
import { IncidentFilterOptions, IncidentStatus } from './types';
import { RiskLevel } from '../../types/risk';
import { Search, Filter, RefreshCw } from 'lucide-react';

interface IncidentFiltersProps {
  filters: IncidentFilterOptions;
  onChange: (newFilters: IncidentFilterOptions) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const IncidentFilters: React.FC<IncidentFiltersProps> = ({
  filters,
  onChange,
  onRefresh,
  isLoading = false,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search incident ID, target name, or notes..."
          value={filters.searchTerm || ''}
          onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
          className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/80 transition-colors font-medium"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Status Filter */}
        <select
          value={filters.status || 'ALL'}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as IncidentStatus | 'ALL' })
          }
          className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-blue-500/80 cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="RESOLVED">Resolved</option>
          <option value="FALSE_POSITIVE">False Positive</option>
        </select>

        {/* Risk Level Filter */}
        <select
          value={filters.riskLevel || 'ALL'}
          onChange={(e) =>
            onChange({ ...filters, riskLevel: e.target.value as RiskLevel | 'ALL' })
          }
          className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-blue-500/80 cursor-pointer"
        >
          <option value="ALL">All Risk Levels</option>
          <option value="CRITICAL">Critical Risk</option>
          <option value="HIGH">High Risk</option>
          <option value="MEDIUM">Medium Risk</option>
          <option value="LOW">Low Risk</option>
        </select>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Incidents"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};
