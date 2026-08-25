'use client';

import React from 'react';
import { AlertTriangle, Shield, CheckCircle, X } from 'lucide-react';
import { useLiveSessionStore } from '@/store/liveSessionStore';

interface AlertBannerProps {
  onOpenSecondaryModal: () => void;
  onReportIncident: () => void;
}

export default function AlertBanner({ onOpenSecondaryModal, onReportIncident }: AlertBannerProps) {
  const riskLevel = useLiveSessionStore((s) => s.riskLevel);
  const riskScore = useLiveSessionStore((s) => s.riskScore);
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const activeAlert = useLiveSessionStore((s) => s.activeAlert);
  const clearAlert = useLiveSessionStore((s) => s.clearAlert);

  if (riskLevel !== 'High' && !activeAlert) {
    return null;
  }

  // If Critical, the full modal takes over, but banner remains if modal is closed
  return (
    <div className="w-full bg-gradient-to-r from-orange-950/90 via-red-950/80 to-orange-950/90 border-b border-orange-500/40 p-4 backdrop-blur-md shadow-2xl animate-in slide-in-from-top-4 duration-300">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-orange-200 tracking-wide uppercase text-sm">
                High Impersonation Risk Detected
              </span>
              <span className="font-mono bg-orange-500/30 text-orange-300 px-2 py-0.5 rounded text-xs font-bold border border-orange-500/50">
                Score {riskScore}/100
              </span>
            </div>
            <p className="text-xs text-orange-200/80 mt-0.5">
              Claimed identity <span className="font-semibold text-white">{claimedIdentity?.name}</span> shows anomalous acoustic cues. Do not confirm wire transfers or disclose credentials.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-center">
          <button
            onClick={onOpenSecondaryModal}
            className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-orange-900/30"
          >
            <Shield className="w-3.5 h-3.5" />
            Verify Caller
          </button>
          <button
            onClick={onReportIncident}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Log Incident
          </button>
          <button
            onClick={clearAlert}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
