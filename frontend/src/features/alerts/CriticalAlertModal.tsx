import React from 'react';
import { ShieldX, AlertOctagon, PhoneForwarded, FileText, ArrowRight, X } from 'lucide-react';
import { formatPercent } from '../../lib/formatters';
import { ClaimedIdentity } from '../../types/session';

interface CriticalAlertModalProps {
  isOpen: boolean;
  score: number;
  deepfakeProbability: number;
  claimedIdentity: ClaimedIdentity | null;
  onClose: () => void;
  onOpenSecondaryVerification: () => void;
  onReportIncident: () => void;
}

export const CriticalAlertModal: React.FC<CriticalAlertModalProps> = ({
  isOpen,
  score,
  deepfakeProbability,
  claimedIdentity,
  onClose,
  onOpenSecondaryVerification,
  onReportIncident,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-950 border-2 border-red-500/80 rounded-2xl shadow-2xl overflow-hidden animate-glow-critical">
        {/* Top Warning Stripe */}
        <div className="bg-red-600 px-6 py-3 flex items-center justify-between text-white">
          <div className="flex items-center gap-2 font-black tracking-wider uppercase text-sm">
            <AlertOctagon className="w-5 h-5 animate-bounce" />
            <span>CRITICAL SECURITY INTERVENTION</span>
          </div>
          <button
            onClick={onClose}
            className="text-red-100 hover:text-white p-1 rounded-md hover:bg-red-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Score & Status */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-red-950/80 border-2 border-red-500 flex flex-col items-center justify-center shadow-lg shadow-red-950/80">
              <span className="font-mono text-3xl font-black text-red-400 leading-none">
                {score}
              </span>
              <span className="text-[10px] uppercase font-bold text-red-400/80 mt-1">
                Risk Score
              </span>
            </div>

            <div className="flex-1">
              <h3 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <ShieldX className="w-6 h-6 text-red-500" />
                <span>Voice Cloning Detected</span>
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Live stream exhibits artificial vocoder phase inconsistencies and synthetic spectral signatures with <span className="font-bold text-red-400">{formatPercent(deepfakeProbability)}</span> deepfake confidence.
              </p>
            </div>
          </div>

          {/* Claimed Target Info */}
          {claimedIdentity && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Impersonated Target
                </span>
                <span className="text-sm font-bold text-slate-100">
                  {claimedIdentity.name}
                </span>
                <span className="text-xs text-slate-400 ml-2">({claimedIdentity.role})</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Official Line
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {claimedIdentity.officialPhone}
                </span>
              </div>
            </div>
          )}

          {/* Action Protocols */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Mandatory Security Actions
            </div>

            <button
              onClick={() => {
                onClose();
                onOpenSecondaryVerification();
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-between transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <PhoneForwarded className="w-4 h-4" />
                <span>Trigger Secondary Verification</span>
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                onClose();
                onReportIncident();
              }}
              className="w-full py-3 px-4 rounded-xl bg-red-950/70 hover:bg-red-900/80 border border-red-500/50 text-red-200 font-bold text-sm flex items-center justify-between transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-400" />
                <span>Log Incident & Lock Transaction</span>
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-2 flex justify-between items-center text-xs text-slate-500 border-t border-slate-900">
            <span>Protocol rule: DO NOT transfer funds or disclose MFA codes.</span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 underline font-medium cursor-pointer"
            >
              Dismiss Warning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
