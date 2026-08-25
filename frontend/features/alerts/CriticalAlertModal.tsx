"use client";

import { useEffect } from "react";
import { useLiveSessionStore } from "@/store/liveSessionStore";
import { useAlertSound } from "./useAlertSound";
import { ShieldAlert, PhoneCall, AlertOctagon, X, CheckCircle2 } from "lucide-react";
import { addIncident } from "@/lib/apiClient";
import { toast } from "sonner";

export default function CriticalAlertModal() {
  const isAlertModalOpen = useLiveSessionStore((s) => s.isAlertModalOpen);
  const activeAlert = useLiveSessionStore((s) => s.activeAlert);
  const latestRiskEvent = useLiveSessionStore((s) => s.latestRiskEvent);
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const setAlertModalOpen = useLiveSessionStore((s) => s.setAlertModalOpen);
  const setSecondaryVerificationModalOpen = useLiveSessionStore(
    (s) => s.setSecondaryVerificationModalOpen
  );

  const { playCriticalAlertSound } = useAlertSound();

  useEffect(() => {
    if (isAlertModalOpen) {
      playCriticalAlertSound();
    }
  }, [isAlertModalOpen, playCriticalAlertSound]);

  if (!isAlertModalOpen || !activeAlert) return null;

  const handleReportIncident = async () => {
    try {
      await addIncident({
        sessionId: activeAlert.sessionId,
        claimedIdentity,
        riskScore: latestRiskEvent?.riskScore ?? 88,
        riskLevel: "Critical",
        summary: `Critical Alert: ${activeAlert.reason}`,
      });
      toast.success("Critical incident logged to registry.");
      setAlertModalOpen(false);
    } catch (e) {
      toast.error("Failed to log incident.");
    }
  };

  const handleSecondaryVerify = () => {
    setAlertModalOpen(false);
    setSecondaryVerificationModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="glass-panel border-2 border-rose-500/80 bg-slate-950/95 max-w-xl w-full rounded-2xl p-6 shadow-2xl shadow-rose-950/80 space-y-6 relative overflow-hidden">
        {/* Glowing emergency accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 animate-pulse"></div>

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-950 border border-rose-800/80 text-rose-500 animate-bounce">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 uppercase">
                  Emergency Protocol
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Session: {activeAlert.sessionId}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight mt-0.5">
                CRITICAL IMPERSONATION ALERT
              </h2>
            </div>
          </div>

          <button
            onClick={() => setAlertModalOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Threat Explanation Box */}
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-rose-300 font-bold">Threat Level: CRITICAL</span>
            <span className="text-rose-400 font-extrabold text-sm">
              Score: {latestRiskEvent?.riskScore ?? 88}/100
            </span>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed font-sans">{activeAlert.reason}</p>

          <div className="pt-2 border-t border-rose-900/50 text-[11px] text-slate-300 flex items-center justify-between">
            <span>Claimed Identity:</span>
            <span className="font-bold text-white font-mono">{claimedIdentity}</span>
          </div>
        </div>

        {/* Recommended Immediate Actions */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">
            Mandatory Action Required:
          </h4>
          <p className="text-xs text-slate-300">
            {activeAlert.recommendedAction ||
              "Do not authorize sensitive transactions. Conduct secondary verification over out-of-band registered phone line."}
          </p>
        </div>

        {/* Modal Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={handleSecondaryVerify}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-blue-950 transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Secondary Verify</span>
          </button>

          <button
            onClick={handleReportIncident}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs shadow-lg shadow-rose-950 transition-all"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Log Incident</span>
          </button>

          <button
            onClick={() => setAlertModalOpen(false)}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Dismiss Overlay</span>
          </button>
        </div>
      </div>
    </div>
  );
}
