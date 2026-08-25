import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Radio, 
  ShieldAlert, 
  Users, 
  ShieldCheck, 
  Volume2,
  ChevronRight
} from 'lucide-react';
import { useLiveSessionStore } from '../../store/liveSessionStore';

export const Sidebar: React.FC = () => {
  const isActive = useLiveSessionStore((state) => state.isActive);
  const latestRiskLevel = useLiveSessionStore((state) => state.latestRiskLevel);

  const navItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: LayoutDashboard,
    },
    {
      label: 'Live Verification',
      path: '/live-verification',
      icon: Radio,
      badge: isActive ? (
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          LIVE
        </span>
      ) : undefined,
    },
    {
      label: 'Incident History',
      path: '/incidents',
      icon: ShieldAlert,
    },
    {
      label: 'Voice Profiles',
      path: '/enrollment',
      icon: Users,
    },
  ];

  return (
    <aside className="w-64 bg-slate-950/90 border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen sticky top-0 backdrop-blur-xl z-20">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              <span>VoiceShield</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                AI
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Real-time Voice Impersonation Defense
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Main Platform
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive: isLinkActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isLinkActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Live Protection Status Pill in Sidebar Footer */}
      <div className="p-4 border-t border-slate-800/80">
        <div className="glass-panel p-3.5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Defense Engine</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
          <div className="text-[10px] text-slate-500 leading-tight">
            16kHz Dhwani & Fusion model ready for spectral verification.
          </div>
        </div>
      </div>
    </aside>
  );
};
