'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Phone,
  Mail,
  KeyRound,
  UserCheck,
  X,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { useLiveSessionStore } from '@/store/liveSessionStore';
import { apiClient } from '@/lib/apiClient';

interface SecondaryVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SecondaryVerificationModal({
  isOpen,
  onClose,
  onSuccess,
}: SecondaryVerificationModalProps) {
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const sessionId = useLiveSessionStore((s) => s.sessionId);

  const [selectedMethod, setSelectedMethod] = useState<'phone' | 'email_otp' | 'mfa_push' | 'manager_escalate'>('phone');
  const [verificationStatus, setVerificationStatus] = useState<'IDLE' | 'PENDING' | 'VERIFIED' | 'FAILED'>('IDLE');
  const [activeVerificationId, setActiveVerificationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleInitiate = async (method: 'phone' | 'email_otp' | 'mfa_push' | 'manager_escalate') => {
    setSelectedMethod(method);
    setIsSubmitting(true);
    setVerificationStatus('PENDING');

    try {
      const res = await apiClient.initiateSecondaryVerification({
        sessionId,
        identityId: claimedIdentity?.id || 'unknown',
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
      if (status === 'VERIFIED') {
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to update verification status:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Out-of-Band Secondary Verification</h2>
              <p className="text-xs text-slate-400">Independent identity challenge protocol</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Warning Callout */}
        <div className="my-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <span className="font-bold text-amber-300 block mb-0.5">
              CRITICAL SECURITY DIRECTIVE:
            </span>
            Do NOT trust the caller&apos;s active connection or any callback numbers they provide orally. Only communicate through verified enterprise directory endpoints.
          </div>
        </div>

        {/* Official Org Directory Lookup Details */}
        <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 mb-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Verified Enterprise Directory Record
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Claimed Identity</span>
              <span className="font-bold text-slate-200">{claimedIdentity?.name}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Designated Title</span>
              <span className="text-slate-300">{claimedIdentity?.role}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Registered Direct Phone</span>
              <span className="font-mono text-cyan-400 font-semibold">
                {claimedIdentity?.phone || '+1 (555) 019-2834'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Official Corporate Email</span>
              <span className="font-mono text-indigo-400 text-xs truncate block">
                {claimedIdentity?.email || 'verified@acmecorp.com'}
              </span>
            </div>
          </div>
        </div>

        {/* Method Selectors */}
        {verificationStatus === 'IDLE' && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Select Verification Vector
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleInitiate('phone')}
                disabled={isSubmitting}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-left transition-all flex items-center gap-3"
              >
                <Phone className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Call Registered Desk</span>
                  <span className="text-[10px] text-slate-400">Ring verified phone line</span>
                </div>
              </button>

              <button
                onClick={() => handleInitiate('mfa_push')}
                disabled={isSubmitting}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-xl text-left transition-all flex items-center gap-3"
              >
                <KeyRound className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Send MFA Push</span>
                  <span className="text-[10px] text-slate-400">Okta / Duo security prompt</span>
                </div>
              </button>

              <button
                onClick={() => handleInitiate('email_otp')}
                disabled={isSubmitting}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl text-left transition-all flex items-center gap-3"
              >
                <Mail className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Dispatch OTP Code</span>
                  <span className="text-[10px] text-slate-400">6-digit challenge to email</span>
                </div>
              </button>

              <button
                onClick={() => handleInitiate('manager_escalate')}
                disabled={isSubmitting}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-pink-500/50 rounded-xl text-left transition-all flex items-center gap-3"
              >
                <UserCheck className="w-5 h-5 text-pink-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Supervisor Verify</span>
                  <span className="text-[10px] text-slate-400">Direct verbal manager signoff</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Verification in progress */}
        {verificationStatus === 'PENDING' && (
          <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-900/50 text-center animate-in fade-in">
            <div className="flex items-center justify-center gap-2 text-indigo-400 mb-2">
              <Clock className="w-5 h-5 animate-spin" />
              <span className="text-sm font-bold uppercase tracking-wider">
                Challenge Dispatched ({selectedMethod.replace('_', ' ').toUpperCase()})
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Waiting for operator confirmation or caller authorization...
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => handleUpdateStatus('VERIFIED')}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Verified
              </button>
              <button
                onClick={() => handleUpdateStatus('FAILED')}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-red-950/50"
              >
                <XCircle className="w-4 h-4" />
                Mark Failed / Spoofed
              </button>
            </div>
          </div>
        )}

        {/* Verification Success */}
        {verificationStatus === 'VERIFIED' && (
          <div className="bg-emerald-950/40 p-5 rounded-2xl border border-emerald-500/50 text-center animate-in fade-in">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-300">Identity Authenticated</h3>
            <p className="text-xs text-emerald-200/80 mt-1">
              Caller verified via official out-of-band enterprise channel.
            </p>
          </div>
        )}

        {/* Verification Failed */}
        {verificationStatus === 'FAILED' && (
          <div className="bg-red-950/40 p-5 rounded-2xl border border-red-500/50 text-center animate-in fade-in">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-red-300">Verification Challenge Failed</h3>
            <p className="text-xs text-red-200/80 mt-1">
              Caller unable to authenticate. Logged in incident repository.
            </p>
            <button
              onClick={onClose}
              className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
