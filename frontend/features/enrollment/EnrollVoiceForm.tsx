"use client";

import { useState } from "react";
import { Mic, Upload, CheckCircle2, ShieldCheck } from "lucide-react";
import { useMicrophoneCapture } from "@/features/audio-capture/useMicrophoneCapture";
import { toast } from "sonner";

export default function EnrollVoiceForm() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("CEO");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isRecording, startRecording, stopRecording } = useMicrophoneCapture({
    onChunkAvailable: () => {},
    onError: (err) => toast.error(err),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !department) {
      toast.error("Please fill in identity name and department.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success(`Voice profile sample enrolled for ${name} (${role})!`);
      setName("");
      setDepartment("");
      setPhone("");
      setFile(null);
    }, 1000);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4"
    >
      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-cyan-400" />
        <span>Enroll New Executive Voice Profile</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-300 font-mono">Full Name</label>
          <input
            type="text"
            placeholder="e.g. Eleanor Vance"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-slate-300 font-mono">Role / Identity</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="CEO">CEO</option>
            <option value="CFO">CFO</option>
            <option value="Manager">Manager</option>
            <option value="Unknown">Executive Director</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-slate-300 font-mono">Department</label>
          <input
            type="text"
            placeholder="e.g. Finance & Treasury"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-slate-300 font-mono">Registered Out-of-Band Phone</label>
          <input
            type="text"
            placeholder="+1 (555) 019-2831"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Audio Sample Recorder / File Upload */}
      <div className="space-y-2 pt-2">
        <label className="text-xs font-semibold text-slate-300 font-mono">
          Reference Voice Print Audio Sample
        </label>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                isRecording
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200"
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{isRecording ? "Recording Reference..." : "Record 10s Sample"}</span>
            </button>
            <span className="text-xs text-slate-400 font-mono">OR</span>
          </div>

          <input
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
            className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-950 transition-all flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>{isSubmitting ? "Enrolling Neural Voice Print..." : "Save & Enroll Profile"}</span>
      </button>
    </form>
  );
}
