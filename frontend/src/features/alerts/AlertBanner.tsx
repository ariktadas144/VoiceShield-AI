import React from 'react';
import { AlertTriangle, X, ShieldAlert, ArrowRight } from 'lucide-react';
import { RiskLevel } from '../../types/risk';

interface AlertBannerProps {
  level: RiskLevel;
  title: string;
  message: string;
  onDismiss?: () => void;
  onVerifyCaller?: () => void;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  level,
  title,
  message,
  onDismiss,
  onVerifyCaller,
  className = '',
}) => {
  if (level !== 'HIGH' && level !== 'CRITICAL') return null;

  const isCritical = level === 'CRITICAL';

  return (
    <div
      className={`w-full border-b transition-all duration-300 ${
        isCritical
          ? 'bg-red-950/90 border-red-500/60 text-red-100 animate-glow-critical'
          : 'bg-orange-950/80 border-orange-500/50 text-orange-100 animate-glow-high'
      } px-4 py-3 shadow-lg ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isCritical ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            {isCritical ? (
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>{title}</span>
              <span
                className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-black ${
                  isCritical ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
                }`}
              >
                {level}
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">{message}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {onVerifyCaller && (
            <button
              onClick={onVerifyCaller}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm ${
                isCritical
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              <span>Secondary Verify</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-white/5 transition-colors"
              title="Dismiss Alert"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
