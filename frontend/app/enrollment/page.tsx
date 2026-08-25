'use client';

import React, { useState } from 'react';
import { useIdentities } from '@/features/enrollment/api';
import EnrolledIdentityList from '@/features/enrollment/EnrolledIdentityList';
import EnrollVoiceForm from '@/features/enrollment/EnrollVoiceForm';
import { EnrolledIdentity } from '@/types/enrollment';
import { Fingerprint, UserPlus } from 'lucide-react';

export default function VoiceProfilesPage() {
  const { data: identities, isLoading } = useIdentities();
  const [selectedIdentity, setSelectedIdentity] = useState<EnrolledIdentity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleOpenNewEnrollment = () => {
    setSelectedIdentity(null);
    setIsFormOpen(true);
  };

  const handleSelectIdentity = (identity: EnrolledIdentity) => {
    setSelectedIdentity(identity);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Fingerprint className="w-7 h-7 text-indigo-400" />
            Biometric Voice Profile Directory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Registered baseline voiceprints for executives and high-privilege staff to ensure accurate speaker verification.
          </p>
        </div>

        <button
          onClick={handleOpenNewEnrollment}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl flex items-center gap-2 shadow-lg shadow-indigo-950 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Enroll New Executive
        </button>
      </div>

      {/* Identities List Grid */}
      <EnrolledIdentityList
        identities={identities || []}
        isLoading={isLoading}
        onSelectForEnrollment={handleSelectIdentity}
      />

      {/* Voice Enrollment Modal Form */}
      {isFormOpen && (
        <EnrollVoiceForm
          initialIdentity={selectedIdentity}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
}
