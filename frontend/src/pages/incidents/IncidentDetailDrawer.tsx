import React, { useState } from 'react';
import { Incident, IncidentStatus } from '../../types/incident';
import { useUpdateIncidentStatus } from '../../features/incidents/api';
import { RiskBadge } from '../../features/risk-engine-ui/RiskBadge';
import { formatTimestamp, formatPercent, formatDuration } from '../../lib/formatters';
import { 
  X, 
  ShieldAlert, 
  Bot, 
  UserCheck, 
  Activity, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  PhoneCall,
  Sparkles
} from 'lucide-react';

interface IncidentDetailDrawerProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
}

export const IncidentDetailDrawer: React.FC<IncidentDetailDrawerProps> = ({
  incident,
  isOpen,
  onClose,
}) => {
  const [analystNotes, setAnalystNotes] = useState<string>('');
  const updateStatusMutation = useUpdateIncidentStatus();

  if (!isOpen || !incident) return null;

  const handleStatusChange = async (status: IncidentStatus) => {
    await updateStatusMutation.mutateAsync({
      id: incident.id,
      status,
      notes: analystNotes || undefined,
    });
  };

  const evidence = incident.evidence;
  const breakdown = evidence?.fusionBreakdown;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl h-full bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-100">
                  {incident.id}
                </span>
                <RiskBadge
                  level={incident.peakRiskLevel}
                  score={incident.peakRiskScore}
                  showScore={true}
                  size="sm"
                />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Session: <span className="font-mono">{incident.sessionId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Executive Summary */}
          <div className="glass-panel p-4 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Forensic Incident Summary
            </span>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              {incident.summary}
            </p>
          </div>

          {/* Caller & Claimed Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-panel p-3.5 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider block">
                Claimed Identity
              </span>
              <div className="font-bold text-slate-100">{incident.claimedIdentityName}</div>
              <div className="text-slate-400 text-[11px]">
                {incident.claimedIdentityRole} • {incident.claimedIdentityDepartment}
              </div>
            </div>

            <div className="glass-panel p-3.5 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider block">
                Caller Line Used
              </span>
              <div className="font-mono font-bold text-orange-400">{incident.callerPhone}</div>
              <div className="text-slate-400 text-[11px]">
                Logged {formatTimestamp(incident.timestamp)}
              </div>
            </div>
          </div>

          {/* Multi-Signal Forensics */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Multi-Signal Acoustic Evidence</span>
            </span>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <Bot className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-400 block font-semibold">Deepfake Model</span>
                <span className="font-mono text-base font-bold text-purple-300">
                  {formatPercent(evidence?.deepfakeProbability)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <UserCheck className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-400 block font-semibold">Speaker Match</span>
                <span className="font-mono text-base font-bold text-cyan-300">
                  {formatPercent(evidence?.speakerMatchScore)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <Activity className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <span className="text-[10px] text-slate-400 block font-semibold">Prosody Glitch</span>
                <span className="font-mono text-base font-bold text-emerald-300">
                  {formatPercent(evidence?.prosodyAnomalyScore)}
                </span>
              </div>
            </div>

            {/* Fusion Weight Breakdown */}
            {breakdown && (
              <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Weighted Risk Fusion Contribution
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deepfake Countermeasure (40%):</span>
                    <span className="font-mono font-bold text-slate-200">+{breakdown.deepfake_contribution} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Speaker Vector Mismatch (25%):</span>
                    <span className="font-mono font-bold text-slate-200">+{breakdown.speaker_mismatch_contribution} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prosody/Vocoder Anomaly (15%):</span>
                    <span className="font-mono font-bold text-slate-200">+{breakdown.prosody_contribution} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Context Risk Factor (20%):</span>
                    <span className="font-mono font-bold text-slate-200">+{breakdown.context_contribution} pts</span>
                  </div>
                </div>
              </div>
            )}

            {/* Speech snippet */}
            {evidence?.transcriptionSnippet && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Interception Transcript Excerpt:
                </span>
                <p className="text-slate-300 italic font-mono text-[11px]">
                  {evidence.transcriptionSnippet}
                </p>
              </div>
            )}
          </div>

          {/* Secondary Verification Record */}
          {incident.secondaryVerification && (
            <div className="glass-panel p-4 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Out-of-band Verification Audit
              </span>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Method:</span>
                  <span className="font-semibold text-slate-200">{incident.secondaryVerification.methodUsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Result:</span>
                  <span
                    className={`font-bold font-mono ${
                      incident.secondaryVerification.result === 'VERIFIED'
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {incident.secondaryVerification.result}
                  </span>
                </div>
                {incident.secondaryVerification.notes && (
                  <p className="text-slate-300 text-[11px] mt-1 pt-1 border-t border-slate-800">
                    {incident.secondaryVerification.notes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Analyst Status Override */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Update Incident Status
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleStatusChange('UNDER_REVIEW')}
                disabled={incident.status === 'UNDER_REVIEW' || updateStatusMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  incident.status === 'UNDER_REVIEW'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                Under Review
              </button>

              <button
                onClick={() => handleStatusChange('RESOLVED')}
                disabled={incident.status === 'RESOLVED' || updateStatusMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  incident.status === 'RESOLVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                Mark Resolved
              </button>

              <button
                onClick={() => handleStatusChange('FALSE_POSITIVE')}
                disabled={incident.status === 'FALSE_POSITIVE' || updateStatusMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  incident.status === 'FALSE_POSITIVE'
                    ? 'bg-slate-700 text-slate-200 border-slate-600'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                Mark False Positive
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
