"use client";

import { useLiveSessionStore } from "@/store/liveSessionStore";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

export default function AlertBanner() {
  const activeAlert = useLiveSessionStore((s) => s.activeAlert);
  const clearAlert = useLiveSessionStore((s) => s.clearAlert);
  const setSecondaryVerificationModalOpen = useLiveSessionStore(
    (s) => s.setSecondaryVerificationModalOpen
  );

  if (!activeAlert) return null;

  const isCritical = activeAlert.severity === "Critical";

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg transition-all animate-pulse-glow ${
        isCritical
          ? "bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/50"
          : "bg-orange-950/90 border-orange-500/80 text-orange-100 shadow-orange-950/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg ${
            isCritical ? "bg-rose-900/60 text-rose-300" : "bg-orange-900/60 text-orange-300"
          }`}
        >
          {isCritical ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider">
            <span>{activeAlert.severity} Risk Alert Flagged</span>
            <span className="text-[10px] opacity-75">({activeAlert.sessionId})</span>
          </div>
          <p className="text-xs mt-0.5 font-medium">{activeAlert.reason}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          onClick={() => setSecondaryVerificationModalOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-950 hover:bg-slate-200 transition-all shadow-md"
        >
          Verify Caller Now
        </button>

        <button
          onClick={clearAlert}
          className="p-1 rounded-lg hover:bg-black/20 text-slate-300 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
