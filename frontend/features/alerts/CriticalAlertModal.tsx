'use client';

import React from 'react';
import { ShieldAlert, PhoneCall, ShieldX, CheckCircle, XCircle } from 'lucide-react';
import { useLiveSessionStore } from '@/store/liveSessionStore';

interface CriticalAlertModalProps {
  onOpenSecondaryVerification: () => void;
  onReportIncident: () => void;
}

export default function CriticalAlertModal({
  onOpenSecondaryVerification,
  onReportIncident,
}: CriticalAlertModalProps) {
  const isOpen = useLiveSessionStore((s) => s.isCriticalModalOpen);
  const setOpen = useLiveSessionStore((s) => s.setCriticalModalOpen);
  const riskScore = useLiveSessionStore((s) => s.riskScore);
  const deepfakeProb = useLiveSessionStore((s) => s.deepfakeProbability);
  const speakerScore = useLiveSessionStore((s) => s.speakerScore);
  const anomalyScore = useLiveSessionStore((s) => s.anomalyScore);
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const stopSession = useLiveSessionStore((s) => s.stopSession);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 to-red-950/40 border-2 border-red-500/70 rounded-3xl p-6 sm:p-8 shadow-[0_0_80px_rgba(239,68,68,0.4)] overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -right-20 -top-20 w-56 h-56 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/40 animate-bounce">
            <ShieldAlert className="w-10 h-10" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="bg-red-500 text-white font-extrabold px-3 py-1 rounded-full text-xs uppercase tracking-widest animate-pulse">
                Critical Security Alert
              </span>
              <span className="font-mono text-red-400 font-bold text-sm">
                Score: {riskScore}/100
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight">
              Synthetic Voice Impersonation Detected
            </h2>
            <p className="text-slate-300 text-sm mt-1 leading-relaxed">
              Real-time multi-signal analysis confirmed synthetic speech patterns attempting to impersonate{' '}
              <span className="text-white font-bold underline decoration-red-500">
                {claimedIdentity?.name || 'Executive Personnel'}
              </span>.
            </p>
          </div>
        </div>

        {/* Evidence Breakdown Grid */}
        <div className="grid grid-cols-3 gap-3 my-6 bg-slate-950/80 rounded-2xl p-4 border border-red-950">
          <div className="text-center p-2 rounded-xl bg-slate-900/50">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Deepfake Prob
            </span>
            <span className="text-2xl font-black font-mono text-red-400 mt-1 block">
              {deepfakeProb}%
            </span>
          </div>

          <div className="text-center p-2 rounded-xl bg-slate-900/50">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Speaker Match
            </span>
            <span className="text-2xl font-black font-mono text-amber-400 mt-1 block">
              {speakerScore}%
            </span>
          </div>

          <div className="text-center p-2 rounded-xl bg-slate-900/50">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Acoustic Anomaly
            </span>
            <span className="text-2xl font-black font-mono text-pink-400 mt-1 block">
              {anomalyScore}%
            </span>
          </div>
        </div>

        {/* Mandatory Action Directive */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-xs text-red-200">
          <p className="font-bold flex items-center gap-1.5 text-red-300 uppercase tracking-wider mb-1">
            <ShieldX className="w-4 h-4" /> Recommended Protocol:
          </p>
          Do not execute financial transactions, disclose MFA credentials, or modify vendor payment destinations based on this voice call.
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => {
              setOpen(false);
              onOpenSecondaryVerification();
            }}
            className="w-full sm:flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-red-950/50 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <PhoneCall className="w-4 h-4" />
            Out-of-Band Verify
          </button>

          <button
            onClick={() => {
              stopSession();
              setOpen(false);
              onReportIncident();
            }}
            className="w-full sm:flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Block &amp; Log Incident
          </button>

          <button
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto py-3 px-4 text-slate-400 hover:text-white font-medium rounded-xl hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1.5 text-xs"
          >
            <XCircle className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
