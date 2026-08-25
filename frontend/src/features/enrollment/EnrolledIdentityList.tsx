import React from 'react';
import { EnrolledIdentity, EnrollmentStatus } from '../../types/enrollment';
import { formatRelativeTime } from '../../lib/formatters';
import { UserCheck, ShieldAlert, Clock, Mic, Plus, CheckCircle2 } from 'lucide-react';

interface EnrolledIdentityListProps {
  identities: EnrolledIdentity[];
  onEnrollClick: (identity: EnrolledIdentity) => void;
  isLoading?: boolean;
}

export const EnrolledIdentityList: React.FC<EnrolledIdentityListProps> = ({
  identities,
  onEnrollClick,
  isLoading = false,
}) => {
  const getStatusBadge = (status: EnrollmentStatus) => {
    switch (status) {
      case 'ENROLLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Enrolled
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Pending Samples
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Not Enrolled
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-44 bg-slate-900/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {identities.map((identity) => (
        <div
          key={identity.id}
          className="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all group"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center font-bold text-base text-blue-400">
                {identity.name.split(' ').map((n) => n[0]).join('')}
              </div>
              {getStatusBadge(identity.status)}
            </div>

            <div className="mt-3.5">
              <h4 className="text-sm font-bold text-slate-100 group-hover:text-blue-300 transition-colors">
                {identity.name}
              </h4>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {identity.role} • {identity.department}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
              <div className="flex justify-between">
                <span className="text-slate-500">Official Line:</span>
                <span className="font-mono text-slate-300 font-semibold">{identity.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Voice Samples:</span>
                <span className="font-mono text-slate-300 font-semibold">
                  {identity.samplesCount} reference {identity.samplesCount === 1 ? 'file' : 'files'}
                </span>
              </div>
              {identity.voiceVectorModel && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Vector Embed:</span>
                  <span className="font-mono text-[11px] text-cyan-400 font-semibold">
                    {identity.voiceVectorModel}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800/60">
            <button
              onClick={() => onEnrollClick(identity)}
              className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                identity.status === 'ENROLLED'
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40'
              }`}
            >
              {identity.status === 'ENROLLED' ? (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add More Samples</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Enroll Voice Sample</span>
                </>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
