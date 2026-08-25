"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  LayoutDashboard,
  Mic,
  FileSpreadsheet,
  UserCheck,
  ShieldCheck,
  Radio,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    name: "Live Verification",
    href: "/live-verification",
    icon: Mic,
    badge: "REALTIME",
  },
  {
    name: "Incident History",
    href: "/incidents",
    icon: FileSpreadsheet,
    badge: null,
  },
  {
    name: "Secondary Verification",
    href: "/secondary-verification",
    icon: ShieldCheck,
    badge: null,
  },
  {
    name: "Voice Profiles",
    href: "/enrollment",
    icon: UserCheck,
    badge: null,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-950/90 border-r border-slate-800/60 flex flex-col justify-between h-screen sticky top-0 z-30 select-none backdrop-blur-xl">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/60 flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <ShieldAlert className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-100 tracking-wider flex items-center gap-1.5">
              VoiceShield
              <span className="text-[10px] font-semibold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30 uppercase tracking-widest">
                AI
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">Impersonation Shield</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5 mt-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (pathname ? pathname.startsWith(item.href + "/") : false);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                  isActive
                    ? "bg-gradient-to-r from-blue-600/20 to-cyan-600/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-950/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={clsx(
                      "w-4 h-4 transition-transform duration-150 group-hover:scale-110",
                      isActive ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"
                    )}
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span className="text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                    <Radio className="w-2.5 h-2.5" />
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status Card */}
      <div className="p-3 m-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-xs font-semibold text-slate-300">Detection Engine</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
            ONLINE
          </span>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
          <span>Neural Model:</span>
          <span className="font-mono text-slate-300">v4.2-prosody</span>
        </div>
      </div>
    </aside>
  );
}
