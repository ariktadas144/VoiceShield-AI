"use client";

import { useState } from "react";
import { useIncidents } from "@/features/incidents/api";
import { Incident, IncidentStatus } from "@/types/incident";
import { RISK_COLORS } from "@/lib/constants";
import IncidentDetailDrawer from "@/features/incidents/IncidentDetailDrawer";
import { FileSpreadsheet, Search, Filter, ShieldAlert, ArrowUpDown, ChevronRight } from "lucide-react";

export default function IncidentHistoryPage() {
  const { data: incidents = [], isLoading } = useIncidents();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [levelFilter, setLevelFilter] = useState<string>("All");

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.claimedIdentity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.summary.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "All" || inc.status === statusFilter;
    const matchesLevel = levelFilter === "All" || inc.riskLevel === levelFilter;

    return matchesSearch && matchesStatus && matchesLevel;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-cyan-400" />
            <span>Incident History & Audit Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical registry of flagged impersonation attempts, deepfake risk scores, and security resolutions.
          </p>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, identity, summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Under Review">Under Review</option>
              <option value="Resolved">Resolved</option>
              <option value="False Positive">False Positive</option>
            </select>
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="All">All Risk Levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            Loading incident registry...
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400 font-mono">No incidents match the active filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 uppercase text-[10px] font-mono text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Incident ID</th>
                  <th className="py-3.5 px-4">Claimed Identity</th>
                  <th className="py-3.5 px-4">Risk Severity</th>
                  <th className="py-3.5 px-4">Deepfake Prob.</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredIncidents.map((inc) => {
                  const colorConfig = RISK_COLORS[inc.riskLevel] || RISK_COLORS.Low;

                  return (
                    <tr
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className="hover:bg-slate-900/60 cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-4 font-bold text-cyan-400 group-hover:underline">
                        {inc.id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-200 font-sans font-semibold">
                        {inc.claimedIdentity}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border}`}
                        >
                          {inc.riskLevel} ({inc.riskScore})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        {inc.deepfakeProbability}%
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                            inc.status === "Resolved"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : inc.status === "Open"
                              ? "bg-rose-950 text-rose-400 border border-rose-800"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {inc.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(inc.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incident Detail Side Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
