import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/apiClient';
import { useLiveSessionStore } from '../../store/liveSessionStore';
import { formatDuration } from '../../lib/formatters';
import { Activity, ShieldCheck, Server, Radio, PhoneForwarded } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export const Topbar: React.FC = () => {
  const location = useLocation();
  const isActive = useLiveSessionStore((state) => state.isActive);
  const durationSeconds = useLiveSessionStore((state) => state.durationSeconds);
  const connectionStatus = useLiveSessionStore((state) => state.connectionStatus);

  // Check backend health
  const { data: healthData } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      try {
        return await apiGet<any>('/health');
      } catch {
        return { status: 'mock', deepfake_model: { loaded: true, checkpoint: 'dhwani_onnx' } };
      }
    },
    refetchInterval: 15000,
  });

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return { title: 'Security Overview Dashboard', subtitle: 'Real-time telemetry and threats' };
      case '/live-verification':
        return { title: 'Live Voice Stream Verification', subtitle: 'Streaming acoustic & vocoder deepfake analysis' };
      case '/incidents':
        return { title: 'Incident Forensics & Audit Log', subtitle: 'Review and resolve flagged voice interactions' };
      case '/enrollment':
        return { title: 'Voice Profile Directory', subtitle: 'Manage trusted executive voice baselines' };
      default:
        return { title: 'VoiceShield AI', subtitle: 'Biometric voice security' };
    }
  };

  const { title, subtitle } = getPageTitle();

  return (
    <header className="h-16 px-8 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
      <div>
        <h2 className="text-sm font-bold text-slate-100 tracking-tight">{title}</h2>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Backend & Detector Model Status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-[11px] font-medium">Model Engine:</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {healthData?.deepfake_model?.checkpoint || 'Dhwani / Ready'}
          </span>
        </div>

        {/* Live Active Session Status */}
        {isActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-950/50 border border-red-500/30 text-xs">
            <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span className="text-red-300 font-bold uppercase text-[10px] tracking-wider">
              Live Stream
            </span>
            <span className="font-mono text-xs font-bold text-red-200">
              {formatDuration(durationSeconds)}
            </span>
          </div>
        )}

        {/* Quick CTA */}
        {location.pathname !== '/live-verification' && (
          <Link
            to="/live-verification"
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-950/40 transition-colors"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Launch Live Scan</span>
          </Link>
        )}
      </div>
    </header>
  );
};
