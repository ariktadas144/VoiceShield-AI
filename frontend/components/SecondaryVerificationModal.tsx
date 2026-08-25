"use client";

import { useState } from "react";
import {
  ShieldCheck,
  PhoneCall,
  Smartphone,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  User,
} from "lucide-react";
import { useLiveSessionStore } from "@/store/liveSessionStore";
import { toast } from "sonner";

interface Props {
  onClose?: () => void;
}

export function SecondaryVerificationModal({ onClose }: Props) {
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const [method, setMethod] = useState<"phone" | "mfa" | "otp" | "escalate">("phone");
  const [status, setStatus] = useState<"Pending" | "Verified" | "Failed">("Pending");
  const [otpCode, setOtpCode] = useState("");

  const registeredDirectory: Record<
    string,
    { name: string; title: string; phone: string; email: string }
  > = {
    CEO: {
      name: "Eleanor Vance",
      title: "Chief Executive Officer",
      phone: "+1 (555) 019-2831",
      email: "e.vance@enterprise-corp.com",
    },
    CFO: {
      name: "Marcus Holloway",
      title: "Chief Financial Officer",
      phone: "+1 (555) 018-9920",
      email: "m.holloway@enterprise-corp.com",
    },
    Manager: {
      name: "Sarah Jenkins",
      title: "Security Operations Director",
      phone: "+1 (555) 014-4411",
      email: "s.jenkins@enterprise-corp.com",
    },
    Unknown: {
      name: "Unregistered Entity",
      title: "External Unknown Caller",
      phone: "No Registered Record",
      email: "unregistered@external.org",
    },
  };

  const contactInfo = registeredDirectory[claimedIdentity] || registeredDirectory.Unknown;

  const handleMarkVerified = () => {
    setStatus("Verified");
    toast.success(`Identity ${contactInfo.name} verified via secondary ${method.toUpperCase()}.`);
    if (onClose) setTimeout(onClose, 1200);
  };

  const handleMarkFailed = () => {
    setStatus("Failed");
    toast.error(`Secondary verification FAILED for ${contactInfo.name}. Impersonation confirmed.`);
    if (onClose) setTimeout(onClose, 1200);
  };

  return (
    <div
      className={
        onClose
          ? "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          : "max-w-4xl mx-auto space-y-6"
      }
    >
      <div
        className={`glass-panel border border-slate-800 bg-slate-950/95 w-full rounded-2xl p-6 space-y-6 ${
          onClose ? "max-w-2xl relative shadow-2xl" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Secondary Identity Verification
              </h2>
              <p className="text-xs text-slate-400">
                Out-of-band identity validation protocol for {claimedIdentity}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                status === "Verified"
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                  : status === "Failed"
                  ? "bg-rose-950 text-rose-400 border-rose-800"
                  : "bg-amber-950 text-amber-400 border-amber-800 animate-pulse"
              }`}
            >
              STATUS: {status.toUpperCase()}
            </span>

            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Security Warning Box */}
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-900/50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <span className="font-bold text-rose-300 uppercase font-mono">
              SECURITY ADVISORY:
            </span>
            <p>
              Do NOT trust the active incoming call audio channel. Initiate secondary verification using official out-of-band corporate channels below.
            </p>
          </div>
        </div>

        {/* Registered Contact Profile */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
            Registered Directory Record ({claimedIdentity})
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div>
              <span className="text-slate-400">Full Name:</span>
              <p className="font-bold text-slate-100 mt-0.5">{contactInfo.name}</p>
            </div>
            <div>
              <span className="text-slate-400">Corporate Title:</span>
              <p className="font-bold text-slate-100 mt-0.5">{contactInfo.title}</p>
            </div>
            <div>
              <span className="text-slate-400">Registered Phone:</span>
              <p className="font-bold text-cyan-300 font-mono mt-0.5">{contactInfo.phone}</p>
            </div>
          </div>
        </div>

        {/* Verification Method Selection Tabs */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase font-mono">
            Select Verification Channel
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => setMethod("phone")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                method === "phone"
                  ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span className="text-xs font-bold">Call Registered #</span>
            </button>

            <button
              onClick={() => setMethod("mfa")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                method === "mfa"
                  ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="text-xs font-bold">Push App MFA</span>
            </button>

            <button
              onClick={() => setMethod("otp")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                method === "otp"
                  ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span className="text-xs font-bold">Send SMS OTP</span>
            </button>

            <button
              onClick={() => setMethod("escalate")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                method === "escalate"
                  ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <User className="w-4 h-4" />
              <span className="text-xs font-bold">Escalate SOC</span>
            </button>
          </div>
        </div>

        {/* Dynamic Channel Input / Guidance */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          {method === "phone" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Initiating encrypted call to registered line: <strong className="font-mono text-cyan-400">{contactInfo.phone}</strong>
              </span>
              <button
                onClick={() => toast.info("Dialing registered phone number...")}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
              >
                Dial Out
              </button>
            </div>
          )}

          {method === "mfa" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Send push notification prompt to registered corporate hardware token.
              </span>
              <button
                onClick={() => toast.success("MFA Push request transmitted.")}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
              >
                Trigger Push
              </button>
            </div>
          )}

          {method === "otp" && (
            <div className="flex items-center gap-3 text-xs">
              <input
                type="text"
                placeholder="Enter 6-digit OTP code..."
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => {
                  if (otpCode.length === 6) handleMarkVerified();
                  else toast.error("Please enter a valid 6-digit code.");
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
              >
                Submit OTP
              </button>
            </div>
          )}

          {method === "escalate" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Escalate session logs directly to Senior Security Incident Responder.
              </span>
              <button
                onClick={() => toast.info("Incident escalated to SOC Manager.")}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
              >
                Escalate Now
              </button>
            </div>
          )}
        </div>

        {/* Decision Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleMarkFailed}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-bold transition-all"
          >
            <XCircle className="w-4 h-4" />
            <span>Mark as Impersonation (Failed)</span>
          </button>

          <button
            onClick={handleMarkVerified}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Mark as Verified</span>
          </button>
        </div>
      </div>
    </div>
  );
}
