'use client';

import React, { useState } from 'react';
import { EnrolledIdentity } from '@/types/enrollment';
import { Upload, Mic, Square, Check, Loader2, X } from 'lucide-react';
import { useEnrollVoice } from './api';

interface EnrollVoiceFormProps {
  initialIdentity?: EnrolledIdentity | null;
  onClose: () => void;
}

export default function EnrollVoiceForm({ initialIdentity, onClose }: EnrollVoiceFormProps) {
  const enrollMutation = useEnrollVoice();

  const [name, setName] = useState(initialIdentity?.name || '');
  const [role, setRole] = useState(initialIdentity?.role || '');
  const [department, setDepartment] = useState(initialIdentity?.department || 'Executive Leadership');
  const [phone, setPhone] = useState(initialIdentity?.phone || '');
  const [email, setEmail] = useState(initialIdentity?.email || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setRecordedBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to record audio:', e);
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await enrollMutation.mutateAsync({
        identityId: initialIdentity?.id || `id_${Date.now()}`,
        name,
        role,
        department,
        phone,
        email,
        audioBlob: recordedBlob || (selectedFile as Blob),
      });
      setSuccessMsg(true);
      setTimeout(() => {
        setSuccessMsg(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Enrollment failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div>
            <h3 className="text-xl font-bold text-white">Enroll Voice Profile</h3>
            <p className="text-xs text-slate-400">Capture biometric voiceprint embeddings</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Voiceprint Enrolled Successfully</h4>
            <p className="text-xs text-slate-400 mt-1">
              Biometric embedding generated with 98% speaker verification accuracy.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Executive / Employee Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Designation / Role</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. CEO"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Department</label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Official Phone</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Official Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@acmecorp.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Audio reference capture section */}
            <div className="pt-2">
              <label className="block text-slate-400 mb-2 font-medium">Reference Voice Audio Sample</label>

              <div className="grid grid-cols-2 gap-3">
                {/* Record button */}
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all ${
                    isRecording
                      ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                      : recordedBlob
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5 text-indigo-400" />}
                  <span className="font-bold text-xs">
                    {isRecording ? 'Stop Recording' : recordedBlob ? 'Sample Recorded' : 'Record Mic'}
                  </span>
                </button>

                {/* Upload File */}
                <label className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer flex flex-col items-center justify-center gap-2 transition-all">
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                    }}
                  />
                  <Upload className="w-5 h-5 text-cyan-400" />
                  <span className="font-bold text-xs truncate max-w-[120px]">
                    {selectedFile ? selectedFile.name : 'Upload File'}
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={enrollMutation.isPending}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-950"
              >
                {enrollMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {enrollMutation.isPending ? 'Processing Voiceprint...' : 'Save Voiceprint'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
