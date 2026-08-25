'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Phone,
  Mail,
  KeyRound,
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from 'lucide-react';
import { DEFAULT_IDENTITIES } from '@/lib/constants';
import { apiClient } from '@/lib/apiClient';

export default function SecondaryVerificationPage() {
  const [selectedIdentityId, setSelectedIdentityId] = useState('ceo');
  const [selectedMethod, setSelectedMethod] = useState<'phone' | 'email_otp' | 'mfa_push' | 'manager_escalate'>('phone');
  const [verificationStatus, setVerificationStatus] = useState<'IDLE' | 'PENDING' | 'VERIFIED' | 'FAILED'>('IDLE');
  const [activeVerificationId, setActiveVerificationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentIdentity = DEFAULT_IDENTITIES.find((id) => id.id === selectedIdentityId) || DEFAULT_IDENTITIES[0];

  const handleInitiate = async (method: 'phone' | 'email_otp' | 'mfa_push' | 'manager_escalate') => {
    setSelectedMethod(method);
    setIsSubmitting(true);
    setVerificationStatus('PENDING');

    try {
      const res = await apiClient.initiateSecondaryVerification({
        sessionId: `sess_manual_${Date.now()}`,
        identityId: currentIdentity.id,
        method,
      });
      setActiveVerificationId(res.verificationId);
    } catch (err) {
      console.error('Failed to initiate verification:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: 'VERIFIED' | 'FAILED') => {
    setIsSubmitting(true);
    try {
      if (activeVerificationId) {
        await apiClient.updateSecondaryVerificationStatus(activeVerificationId, status);
      }
      setVerificationStatus(status);
    } catch (err) {
      console.error('Failed to update verification status:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <ShieldCheck className="w-7 h-7 text-indigo-400" />
          Out-of-Band Secondary Identity Verification
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Perform strict side-channel verification before authorizing sensitive requests, wire transfers, or credential resets.
        </p>
      </div>

      {/* Critical Security Directive */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 flex items-start gap-4 shadow-xl">
        <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200">
          <h4 className="font-bold text-amber-300 text-sm mb-1">
            MANDATORY ANTI-IMPERSONATION PROTOCOL
          </h4>
          Never accept alternative contact details or phone numbers provided by an active incoming caller. Always challenge using pre-registered directory credentials.
        </div>
      </div>

      {/* Directory Lookup & Method Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Identity Selector & Details */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Select Enterprise Identity to Verify
            </label>
            <select
              value={selectedIdentityId}
              onChange={(e) => {
                setSelectedIdentityId(e.target.value);
                setVerificationStatus('IDLE');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium mb-5"
            >
              {DEFAULT_IDENTITIES.map((id) => (
                <option key={id.id} value={id.id}>
                  {id.name} — {id.role}
                </option>
              ))}
            </select>

            <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-850 space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Full Name</span>
                <span className="font-bold text-white text-sm">{currentIdentity.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Role / Organization</span>
                <span className="text-slate-300">{currentIdentity.role}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Official Directory Phone</span>
                <span className="font-mono text-cyan-400 font-bold">{currentIdentity.phone}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Corporate Email Address</span>
                <span className="font-mono text-indigo-300">{currentIdentity.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Challenge Vectors & Actions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Trigger Out-of-Band Challenge
            </h3>

            {verificationStatus === 'IDLE' && (
              <div className="space-y-2.5">
                <button
                  onClick={() => handleInitiate('phone')}
                  disabled={isSubmitting}
                  className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left transition-all flex items-center gap-3"
                >
                  <Phone className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">Call Registered Office Phone</span>
                    <span className="text-[10px] text-slate-400">Initiate direct voice call to verified desk</span>
                  </div>
                </button>

                <button
                  onClick={() => handleInitiate('mfa_push')}
                  disabled={isSubmitting}
                  className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 rounded-2xl text-left transition-all flex items-center gap-3"
                >
                  <KeyRound className="w-5 h-5 text-purple-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">Dispatch Duo / Okta MFA Push</span>
                    <span className="text-[10px] text-slate-400">Send hardware authentication token</span>
                  </div>
                </button>

                <button
                  onClick={() => handleInitiate('email_otp')}
                  disabled={isSubmitting}
                  className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-2xl text-left transition-all flex items-center gap-3"
                >
                  <Mail className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">Send 6-Digit Email OTP Challenge</span>
                    <span className="text-[10px] text-slate-400">Time-sensitive one-time verification passcode</span>
                  </div>
                </button>

                <button
                  onClick={() => handleInitiate('manager_escalate')}
                  disabled={isSubmitting}
                  className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/50 rounded-2xl text-left transition-all flex items-center gap-3"
                >
                  <UserCheck className="w-5 h-5 text-pink-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">Escalate to SOC / Supervisor</span>
                    <span className="text-[10px] text-slate-400">Manager manual authorization</span>
                  </div>
                </button>
              </div>
            )}

            {verificationStatus === 'PENDING' && (
              <div className="bg-slate-950 p-6 rounded-2xl border border-indigo-900/50 text-center animate-in fade-in">
                <Clock className="w-8 h-8 text-indigo-400 mx-auto mb-2 animate-spin" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Challenge Active ({selectedMethod.replace('_', ' ').toUpperCase()})
                </h4>
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  Dispatched out-of-band request to {currentIdentity.name}. Waiting for authorization confirmation.
                </p>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleUpdateStatus('VERIFIED')}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Verified
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('FAILED')}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-red-950"
                  >
                    <XCircle className="w-4 h-4" />
                    Mark Spoofed / Failed
                  </button>
                </div>
              </div>
            )}

            {verificationStatus === 'VERIFIED' && (
              <div className="bg-emerald-950/40 p-6 rounded-2xl border border-emerald-500/50 text-center animate-in fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-base font-bold text-emerald-300">Identity Authenticated</h4>
                <p className="text-xs text-emerald-200/80 mt-1">
                  Caller identity successfully confirmed via registered channels.
                </p>
                <button
                  onClick={() => setVerificationStatus('IDLE')}
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
                >
                  Verify Another Caller
                </button>
              </div>
            )}

            {verificationStatus === 'FAILED' && (
              <div className="bg-red-950/40 p-6 rounded-2xl border border-red-500/50 text-center animate-in fade-in">
                <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <h4 className="text-base font-bold text-red-300">Challenge Failed / Spoof Confirmed</h4>
                <p className="text-xs text-red-200/80 mt-1">
                  Caller failed out-of-band challenge. Terminate active communication immediately.
                </p>
                <button
                  onClick={() => setVerificationStatus('IDLE')}
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
                >
                  Reset Verification
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
