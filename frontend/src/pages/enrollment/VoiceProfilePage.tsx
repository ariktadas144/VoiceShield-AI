import React, { useState } from 'react';
import { useEnrolledIdentities } from '../../features/enrollment/api';
import { EnrolledIdentity } from '../../types/enrollment';
import { EnrolledIdentityList } from '../../features/enrollment/EnrolledIdentityList';
import { EnrollVoiceForm } from '../../features/enrollment/EnrollVoiceForm';
import { Users, Plus, ShieldCheck, Sparkles } from 'lucide-react';

export const VoiceProfilePage: React.FC = () => {
  const [selectedIdentity, setSelectedIdentity] = useState<EnrolledIdentity | null>(null);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);

  const { data: identities, isLoading } = useEnrolledIdentities();

  const handleEnrollClick = (identity: EnrolledIdentity) => {
    setSelectedIdentity(identity);
    setIsEnrollModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>Executive Voice Biometric Profiles</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Registered baseline speaker vectors (ECAPA-TDNN) for executive impersonation verification
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>Vector Match Active</span>
        </div>
      </div>

      {/* Info Card */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-blue-500">
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Speaker Verification Reference Library
          </h4>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            When an incoming call claims to be an executive, VoiceShield compares the live stream against these enrolled embeddings. Minimum 3 high-fidelity audio samples recommended per identity.
          </p>
        </div>
      </div>

      {/* Identities Directory List */}
      <EnrolledIdentityList
        identities={identities || []}
        onEnrollClick={handleEnrollClick}
        isLoading={isLoading}
      />

      {/* Enrollment Modal */}
      <EnrollVoiceForm
        identity={selectedIdentity}
        isOpen={isEnrollModalOpen}
        onClose={() => {
          setIsEnrollModalOpen(false);
          setSelectedIdentity(null);
        }}
      />
    </div>
  );
};
