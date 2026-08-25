'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLiveSessionStore } from '@/store/liveSessionStore';
import StatusPill from '@/components/common/StatusPill';
import { Radio, ShieldAlert, Clock } from 'lucide-react';
import { formatDuration } from '@/lib/formatters';

export default function Topbar() {
  const pathname = usePathname();
  const connectionStatus = useLiveSessionStore((s) => s.connectionStatus);
  const isAnalyzing = useLiveSessionStore((s) => s.isAnalyzing);
  const elapsedSeconds = useLiveSessionStore((s) => s.elapsedSeconds);
  const tickElapsed = useLiveSessionStore((s) => s.tickElapsed);
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);

  useEffect(() => {
    const timer = setInterval(() => {
      tickElapsed();
    }, 1000);
    return () => clearInterval(timer);
  }, [tickElapsed]);

  const getPageTitle = () => {
    if (pathname.includes('/live-verification')) return 'Live Voice Verification Engine';
    if (pathname.includes('/incidents')) return 'Incident Repository & Forensics';
    if (pathname.includes('/enrollment')) return 'Voiceprint Profile Enrollment';
    if (pathname.includes('/secondary-verification')) return 'Out-of-Band Secondary Verification';
    return 'Security Intelligence Dashboard';
  };

  return (
    <header className="h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between z-20 shrink-0 sticky top-0">
      <div className="flex items-center gap-3">
        <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
          {getPageTitle()}
        </h2>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Active Call Live Indicator */}
        {isAnalyzing && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/40 px-3 py-1 rounded-full text-xs font-mono text-red-300">
            <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span className="hidden md:inline font-bold">MONITORING: {claimedIdentity?.name}</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-slate-400" />
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
        )}

        {/* WebSocket / System Status */}
        <StatusPill status={connectionStatus} />

        {/* CTA to live verification if not already there */}
        {!pathname.includes('/live-verification') && (
          <Link
            href="/live-verification"
            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-950/50 flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Start Verification</span>
          </Link>
        )}
      </div>
    </header>
  );
}
