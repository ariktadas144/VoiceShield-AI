'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radio,
  History,
  Fingerprint,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useLiveSessionStore } from '@/store/liveSessionStore';

export default function Sidebar() {
  const pathname = usePathname();
  const isAnalyzing = useLiveSessionStore((s) => s.isAnalyzing);
  const riskScore = useLiveSessionStore((s) => s.riskScore);

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Live Verification',
      href: '/live-verification',
      icon: Radio,
      badge: isAnalyzing ? 'LIVE' : undefined,
    },
    {
      label: 'Incident History',
      href: '/incidents',
      icon: History,
    },
    {
      label: 'Voice Profiles',
      href: '/enrollment',
      icon: Fingerprint,
    },
    {
      label: 'Out-of-Band Auth',
      href: '/secondary-verification',
      icon: ShieldCheck,
    },
  ];

  return (
    <aside className="w-64 bg-slate-950/95 border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 min-h-screen z-30">
      <div>
        {/* Brand Header */}
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-4 mb-6 group">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-900/30 group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 tracking-tight">
              VoiceShield AI
            </h1>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">
              Active Prevention
            </span>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600/25 to-purple-600/10 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-indigo-400' : 'text-slate-500'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="flex items-center gap-1 bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Live Session Radar Pill Widget at bottom of sidebar */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
            Realtime Radar
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isAnalyzing ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'
            }`}
          />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-400">Threat Level:</span>
          <span
            className={`font-mono text-sm font-bold ${
              riskScore > 75
                ? 'text-red-400'
                : riskScore > 60
                ? 'text-orange-400'
                : riskScore > 30
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {isAnalyzing ? `${riskScore}/100` : 'STANDBY'}
          </span>
        </div>
      </div>
    </aside>
  );
}
