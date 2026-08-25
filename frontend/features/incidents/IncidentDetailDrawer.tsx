'use client';

import React, { useState } from 'react';
import { Incident, IncidentStatus } from '@/types/incident';
import RiskBadge from '@/features/risk-engine-ui/RiskBadge';
import { formatDate } from '@/lib/formatters';
import { X, ShieldAlert, Activity, Fingerprint, AudioWaveform, Save, Check } from 'lucide-react';
import { useUpdateIncidentStatus } from './api';

interface IncidentDetailDrawerProps {
  incident: Incident | null;
  onClose: () => void;
}

export default function IncidentDetailDrawer({ incident, onClose }: IncidentDetailDrawerProps) {
  const updateMutation = useUpdateIncidentStatus();
  const [selectedStatus, setSelectedStatus] = useState<IncidentStatus>(
    incident?.status || 'OPEN'
  );
  const [notes, setNotes] = useState<string>(incident?.notes || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!incident) return null;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: incident.id,
        status: selectedStatus,
        notes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to update incident:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white font-mono">{incident.id}</span>
                    <RiskBadge level={incident.riskLevel} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Session: {incident.sessionId}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Caller Identity Summary */}
            <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 my-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Target &amp; Caller Profile
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Claimed Identity</span>
                  <span className="font-bold text-white text-sm block mt-0.5">
                    {incident.claimedIdentity}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Originating Caller Number</span>
                  <span className="font-mono text-cyan-400 text-sm block mt-0.5">
                    {incident.callerNumber || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Incident Logged At</span>
                  <span className="font-mono text-slate-300 mt-0.5 block">
                    {formatDate(incident.timestamp)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Assignee / Reviewer</span>
                  <span className="text-slate-300 mt-0.5 block">
                    {incident.reviewer || 'Security Operations Center'}
                  </span>
                </div>
              </div>
            </div>

            {/* Forensics / Subscore Breakdown */}
            <div className="space-y-3 mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Multi-Signal Forensic Telemetry
              </div>

              {/* Deepfake */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-300">Deepfake Probability Score</span>
                </div>
                <span className="font-mono font-bold text-cyan-400 text-sm">
                  {Math.round(
                    incident.deepfakeProbability <= 1
                      ? incident.deepfakeProbability * 100
                      : incident.deepfakeProbability
                  )}
                  %
                </span>
              </div>

              {/* Speaker Match */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Fingerprint className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-slate-300">Voiceprint Identity Match</span>
                </div>
                <span className="font-mono font-bold text-purple-400 text-sm">
                  {Math.round(
                    incident.speakerScore <= 1
                      ? incident.speakerScore * 100
                      : incident.speakerScore
                  )}
                  %
                </span>
              </div>

              {/* Prosody Anomaly */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AudioWaveform className="w-4 h-4 text-pink-400" />
                  <span className="text-xs text-slate-300">Prosodic / Acoustic Anomaly</span>
                </div>
                <span className="font-mono font-bold text-pink-400 text-sm">
                  {Math.round(
                    incident.anomalyScore <= 1
                      ? incident.anomalyScore * 100
                      : incident.anomalyScore
                  )}
                  %
                </span>
              </div>
            </div>

            {/* Protocol Action Taken */}
            <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-2xl p-4 mb-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
                Prevention Action Executed
              </span>
              <p className="text-xs font-bold text-slate-200">
                {incident.recommendedAction.replace(/_/g, ' ')}
              </p>
              {incident.actionTaken && (
                <p className="text-xs text-slate-400 mt-1">{incident.actionTaken}</p>
              )}
            </div>

            {/* Status Management */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Triage &amp; Case Notes
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Investigation Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as IncidentStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="OPEN">Open (Active Investigation)</option>
                  <option value="UNDER_REVIEW">Under Review (SOC Analyst Assigned)</option>
                  <option value="RESOLVED">Resolved (Impersonation Block Confirmed)</option>
                  <option value="FALSE_POSITIVE">False Positive (Caller Cleared)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Analyst Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter investigation notes, callback confirmation, or forensic remarks..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/30"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Updating...' : 'Save Triage Update'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
