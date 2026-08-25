"use client";

import { useEnrolledIdentities } from "@/features/enrollment/api";
import EnrolledIdentityList from "@/features/enrollment/EnrolledIdentityList";
import EnrollVoiceForm from "@/features/enrollment/EnrollVoiceForm";
import { UserCheck } from "lucide-react";

export default function VoiceProfilePage() {
  const { data: identities = [], isLoading } = useEnrolledIdentities();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <UserCheck className="w-6 h-6 text-cyan-400" />
          <span>Trusted Voice Profiles & Enrollment</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Directory of enrolled executive voice prints used for biometric speaker verification during live calls.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Enrolled Identities Directory */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase font-mono tracking-wider">
            Enrolled Executive Directory ({identities.length})
          </h2>

          {isLoading ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-xs font-mono text-slate-400">
              Loading voice profile directory...
            </div>
          ) : (
            <EnrolledIdentityList identities={identities} />
          )}
        </div>

        {/* Right Column (1 Col): Enroll Voice Form */}
        <div>
          <EnrollVoiceForm />
        </div>
      </div>
    </div>
  );
}
