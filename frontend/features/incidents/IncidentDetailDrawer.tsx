"use client";

import { Incident, IncidentStatus } from "@/types/incident";
import { RISK_COLORS } from "@/lib/constants";
import { X, ShieldAlert, CheckCircle2, Clock, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { useUpdateIncidentStatus } from "./api";
import { toast } from "sonner";

interface Props {
  incident: Incident | null;
  onClose: () => void;
}

export default function IncidentDetailDrawer({ incident, onClose }: Props) {
  const updateStatusMutation = useUpdateIncidentStatus();

  if (!incident) return null;

  const colorConfig = RISK_COLORS[incident.riskLevel] || RISK_COLORS.Low;

  const handleStatusChange = (newStatus: IncidentStatus) => {
    updateStatusMutation.mutate(
      { id: incident.id, status: newStatus },
      {
        onSuccess: () => {
          toast.success(`Incident ${incident.id} updated to ${newStatus}`);
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-950 border-l border-slate-800 h-full p-6 flex flex-col justify-between overflow-y-auto space-y-6 shadow-2xl">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{incident.id}</h2>
                <p className="text-xs text-slate-400">Session Reference: {incident.sessionId}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Risk Level Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${colorConfig.bg} ${colorConfig.border}`}
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className={`w-6 h-6 ${colorConfig.text}`} />
              <div>
                <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                  Overall Risk Score
                </span>
                <p className={`text-2xl font-extrabold font-mono ${colorConfig.text}`}>
                  {incident.riskScore}/100 ({incident.riskLevel})
                </p>
              </div>
            </div>

            {/* Status Dropdown */}
            <div className="space-y-1 text-right">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Incident Status</span>
              <select
                value={incident.status}
                onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                className="bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="Open">Open</option>
                <option value="Under Review">Under Review</option>
                <option value="Resolved">Resolved</option>
                <option value="False Positive">False Positive</option>
              </select>
            </div>
          </div>

          {/* Incident Overview & Claimed Identity */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Identity & Session Metadata
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Claimed Identity:</span>
                <p className="font-bold text-slate-100 mt-0.5">{incident.claimedIdentity}</p>
              </div>
              <div>
                <span className="text-slate-400">Recorded Timestamp:</span>
                <p className="font-mono text-slate-300 mt-0.5">
                  {new Date(incident.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Call Duration:</span>
                <p className="font-mono text-slate-300 mt-0.5">{incident.durationSeconds} seconds</p>
              </div>
              <div>
                <span className="text-slate-400">Target Protocol:</span>
                <p className="font-mono text-cyan-400 mt-0.5">VIP Impersonation Shield</p>
              </div>
            </div>
          </div>

          {/* Sub-Score Deep Dive Evidence */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Evidence Signal Breakdown
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Deepfake Model Probability</span>
                  <span className="font-mono font-bold text-rose-400">
                    {incident.deepfakeProbability}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${incident.deepfakeProbability}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Speaker Biometric Match</span>
                  <span className="font-mono font-bold text-amber-400">
                    {incident.speakerScore}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${incident.speakerScore}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Prosody & Acoustic Anomaly</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {incident.anomalyScore}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-cyan-500"
                    style={{ width: `${incident.anomalyScore}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary & Audit Log */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Executive Summary & Action
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{incident.summary}</p>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 mt-2">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                Recommended Action Logged:
              </span>
              <p className="text-xs text-slate-200 mt-0.5">{incident.recommendedAction}</p>
            </div>
          </div>
        </div>

        {/* Footer Close Button */}
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
          >
            Close Incident Drawer
          </button>
        </div>
      </div>
    </div>
  );
}
