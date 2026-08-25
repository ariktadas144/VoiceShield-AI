"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Activity, Bell, Mic, User } from "lucide-react";

export default function Topbar() {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " UTC"
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 border-b border-slate-800/60 bg-slate-950/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>SYSTEM TIME:</span>
          <span className="text-cyan-300 font-bold">{timeStr || "00:00:00 UTC"}</span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-800/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>LATENCY: 42ms</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/live-verification"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-950 transition-all transform active:scale-95"
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Live Verification</span>
        </Link>

        <div className="w-px h-6 bg-slate-800 mx-1"></div>

        <div className="flex items-center gap-2 pl-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden lg:block text-left text-xs">
            <p className="font-semibold text-slate-200 leading-none">Security Ops</p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: SEC-8902</p>
          </div>
        </div>
      </div>
    </header>
  );
}
