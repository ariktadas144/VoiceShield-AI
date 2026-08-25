"use client";

import { EnrolledIdentity } from "@/types/enrollment";
import { UserCheck, Mic, Phone, CheckCircle2, AlertCircle } from "lucide-react";

export default function EnrolledIdentityList({
  identities = [],
  onSelectIdentity,
}: {
  identities?: EnrolledIdentity[];
  onSelectIdentity?: (identity: EnrolledIdentity) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {identities.map((item) => {
        const isEnrolled = item.status === "Enrolled";

        return (
          <div
            key={item.id}
            onClick={() => onSelectIdentity && onSelectIdentity(item)}
            className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer space-y-4 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {item.role} • {item.department}
                  </p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono border uppercase ${
                  isEnrolled
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                {item.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Samples</span>
                <p className="font-mono font-bold text-slate-200 mt-0.5">{item.sampleCount} Audio</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Quality</span>
                <p className="font-mono font-bold text-cyan-400 mt-0.5">{item.qualityScore}%</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Contact</span>
                <p className="font-mono text-slate-300 truncate mt-0.5">{item.phoneContact}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
