import React, { useState } from 'react';
import { ClaimedIdentity } from '../../types/session';
import { 
  ShieldAlert, 
  PhoneCall, 
  KeyRound, 
  UserCheck2, 
  AlertOctagon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  X, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface SecondaryVerificationModalProps {
  isOpen: boolean;
  claimedIdentity: ClaimedIdentity | null;
  callerNumber: string;
  onClose: () => void;
  onVerificationComplete?: (status: 'VERIFIED' | 'FAILED') => void;
}

export const SecondaryVerificationModal: React.FC<SecondaryVerificationModalProps> = ({
  isOpen,
  claimedIdentity,
  callerNumber,
  onClose,
  onVerificationComplete,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'PHONE' | 'MFA' | 'SUPERVISOR' | null>(null);
  const [verificationState, setVerificationState] = useState<'IDLE' | 'IN_PROGRESS' | 'VERIFIED' | 'FAILED'>('IDLE');
  const [logNotes, setLogNotes] = useState<string>('');

  if (!isOpen) return null;

  const identity = claimedIdentity || {
    name: 'Unspecified Identity',
    role: 'External Caller',
    department: 'General',
    officialPhone: '+1 (555) 000-0000',
    officialEmail: 'unverified@internal.net',
  };

  const handleInitiateMethod = (method: 'PHONE' | 'MFA' | 'SUPERVISOR') => {
    setSelectedMethod(method);
    setVerificationState('IN_PROGRESS');
  };

  const handleMarkVerified = () => {
    setVerificationState('VERIFIED');
    setTimeout(() => {
      onVerificationComplete?.('VERIFIED');
      onClose();
      setVerificationState('IDLE');
      setSelectedMethod(null);
    }, 1500);
  };

  const handleMarkFailed = () => {
    setVerificationState('FAILED');
    setTimeout(() => {
      onVerificationComplete?.('FAILED');
      onClose();
      setVerificationState('IDLE');
      setSelectedMethod(null);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Secondary Identity Verification
              </h3>
              <p className="text-xs text-slate-400">
                Out-of-band verification protocol for high-risk voice interaction
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

        <div className="p-6 space-y-5">
          {/* Explicit Spoofing Security Warning Banner */}
          <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/60 text-red-200 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold tracking-wide uppercase block text-red-300">
                Critical Anti-Spoofing Rule
              </span>
              <span>
                Do <strong className="underline">NOT</strong> trust or dial the incoming number ({callerNumber}). Always initiate contact via the official directory records below.
              </span>
            </div>
          </div>

          {/* Official Directory Record */}
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Verified Enterprise Directory Entry
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Claimed Identity:</span>
                <span className="text-slate-100 font-bold">{identity.name}</span>
                <span className="text-slate-400 block text-[11px]">
                  {identity.role} • {identity.department}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Registered Phone:</span>
                <span className="font-mono text-emerald-400 font-bold text-sm">
                  {identity.officialPhone}
                </span>
              </div>
            </div>
          </div>

          {/* Verification Methods */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Select Out-of-Band Channel
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Method 1: Callback */}
              <button
                onClick={() => handleInitiateMethod('PHONE')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMethod === 'PHONE'
                    ? 'bg-blue-950/60 border-blue-500 text-blue-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <PhoneCall className="w-4 h-4 text-blue-400 mb-2" />
                <div className="text-xs font-bold">Direct Callback</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Dial desk phone</div>
              </button>

              {/* Method 2: MFA */}
              <button
                onClick={() => handleInitiateMethod('MFA')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMethod === 'MFA'
                    ? 'bg-purple-950/60 border-purple-500 text-purple-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <KeyRound className="w-4 h-4 text-purple-400 mb-2" />
                <div className="text-xs font-bold">Push MFA Challenge</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Send Okta / Duo OTP</div>
              </button>

              {/* Method 3: Supervisor */}
              <button
                onClick={() => handleInitiateMethod('SUPERVISOR')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMethod === 'SUPERVISOR'
                    ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <UserCheck2 className="w-4 h-4 text-amber-400 mb-2" />
                <div className="text-xs font-bold">Supervisor Escalate</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Internal Slack bridge</div>
              </button>
            </div>
          </div>

          {/* In-Progress Challenge State */}
          {verificationState === 'IN_PROGRESS' && (
            <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-between text-xs text-blue-300">
              <span className="flex items-center gap-2 font-medium">
                <Clock className="w-4 h-4 text-blue-400 animate-spin" />
                <span>
                  Challenge sent via {selectedMethod}. Awaiting out-of-band response...
                </span>
              </span>
              <span className="font-mono font-bold bg-blue-500/20 px-2 py-0.5 rounded text-[11px]">
                PENDING
              </span>
            </div>
          )}

          {verificationState === 'VERIFIED' && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Identity Authenticated via Secondary Channel. Safe to proceed.</span>
            </div>
          )}

          {verificationState === 'FAILED' && (
            <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500 text-red-200 text-xs font-bold flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <span>Verification Failed or Disavowed by Employee. Impersonation Confirmed.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-900">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 font-semibold"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleMarkFailed}
                disabled={verificationState === 'VERIFIED' || verificationState === 'FAILED'}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-red-400" />
                <span>Mark as Failed</span>
              </button>

              <button
                onClick={handleMarkVerified}
                disabled={verificationState === 'VERIFIED' || verificationState === 'FAILED'}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Mark as Verified</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
