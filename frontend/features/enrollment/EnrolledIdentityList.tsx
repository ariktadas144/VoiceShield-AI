'use client';

import React from 'react';
import { EnrolledIdentity } from '@/types/enrollment';
import { Fingerprint, CheckCircle2, AlertCircle, Phone, Mail, Building } from 'lucide-react';

interface EnrolledIdentityListProps {
  identities: EnrolledIdentity[];
  isLoading?: boolean;
  onSelectForEnrollment: (identity: EnrolledIdentity) => void;
}

export default function EnrolledIdentityList({
  identities,
  isLoading = false,
  onSelectForEnrollment,
}: EnrolledIdentityListProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-400 font-mono">
        Loading biometric voice profile repository...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {identities.map((identity) => (
        <div
          key={identity.id}
          className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all"
        >
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h4 className="text-base font-bold text-white leading-tight">{identity.name}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{identity.role}</p>
              </div>
              {identity.isEnrolled ? (
                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" />
                  Enrolled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <AlertCircle className="w-3 h-3" />
                  Pending
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-400 my-4 bg-slate-950/60 p-3 rounded-xl border border-slate-850 font-mono">
              <div className="flex items-center gap-2">
                <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-slate-300 truncate">{identity.department}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-cyan-400 truncate">{identity.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-indigo-300 truncate">{identity.email}</span>
              </div>
            </div>

            {identity.isEnrolled && (
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-t border-slate-800/80 pt-3">
                <span>Samples: <strong className="text-white">{identity.sampleCount}</strong></span>
                <span>Confidence: <strong className="text-emerald-400">{Math.round((identity.voiceprintConfidence || 0.95) * 100)}%</strong></span>
              </div>
            )}
          </div>

          <button
            onClick={() => onSelectForEnrollment(identity)}
            className="mt-4 w-full py-2 px-3 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            {identity.isEnrolled ? 'Update Voiceprint' : 'Enroll Biometric Voice'}
          </button>
        </div>
      ))}
    </div>
  );
}
