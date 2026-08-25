import React from 'react';
import { formatPercent } from '../../lib/formatters';
import { Bot, UserCheck, Activity, HelpCircle } from 'lucide-react';

interface SubScoreBarsProps {
  deepfakeProbability: number;
  speakerMatchScore: number;
  prosodyAnomalyScore: number;
  hasEnrolledProfile?: boolean;
  className?: string;
}

export const SubScoreBars: React.FC<SubScoreBarsProps> = ({
  deepfakeProbability = 0,
  speakerMatchScore = 1.0,
  prosodyAnomalyScore = 0,
  hasEnrolledProfile = true,
  className = '',
}) => {
  // Deepfake %: High is bad
  const dfPercent = Math.min(Math.max(Math.round(deepfakeProbability * 100), 0), 100);
  const getDfColor = (val: number) => {
    if (val > 70) return 'bg-red-500 shadow-red-500/50';
    if (val > 40) return 'bg-amber-500 shadow-amber-500/50';
    return 'bg-emerald-500 shadow-emerald-500/50';
  };

  // Speaker Match %: High is good (100% = identical voice profile)
  const speakerPercent = Math.min(Math.max(Math.round(speakerMatchScore * 100), 0), 100);
  const getSpeakerColor = (val: number) => {
    if (!hasEnrolledProfile) return 'bg-slate-600';
    if (val > 75) return 'bg-emerald-500 shadow-emerald-500/50';
    if (val > 50) return 'bg-amber-500 shadow-amber-500/50';
    return 'bg-red-500 shadow-red-500/50';
  };

  // Prosody Anomaly %: High is bad
  const prosodyPercent = Math.min(Math.max(Math.round(prosodyAnomalyScore * 100), 0), 100);
  const getProsodyColor = (val: number) => {
    if (val > 65) return 'bg-orange-500 shadow-orange-500/50';
    if (val > 35) return 'bg-amber-500 shadow-amber-500/50';
    return 'bg-emerald-500 shadow-emerald-500/50';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Deepfake Detection */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Bot className="w-4 h-4 text-purple-400" />
            <span>Deepfake Probability</span>
            <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20 font-mono">
              Model
            </span>
          </span>
          <span className="font-mono text-sm font-bold text-slate-100">
            {formatPercent(deepfakeProbability)}
          </span>
        </div>
        <div className="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-sm ${getDfColor(dfPercent)}`}
            style={{ width: `${dfPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
          <span>Natural (0%)</span>
          <span>Synthetic (100%)</span>
        </div>
      </div>

      {/* 2. Speaker Biometric Match */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span>Speaker Profile Match</span>
            {hasEnrolledProfile ? (
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20 font-mono">
                Enrolled
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 bg-slate-500/10 px-1.5 py-0.2 rounded border border-slate-500/20 font-mono">
                No Baseline
              </span>
            )}
          </span>
          <span className="font-mono text-sm font-bold text-slate-100">
            {hasEnrolledProfile ? formatPercent(speakerMatchScore) : 'N/A'}
          </span>
        </div>
        <div className="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-sm ${getSpeakerColor(speakerPercent)}`}
            style={{ width: `${hasEnrolledProfile ? speakerPercent : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
          <span>Mismatch (0%)</span>
          <span>Confirmed Match (100%)</span>
        </div>
      </div>

      {/* 3. Acoustic & Prosody Anomaly */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Prosody & Acoustic Anomaly</span>
            <span className="text-[10px] text-slate-400 bg-slate-500/10 px-1.5 py-0.2 rounded border border-slate-500/20 font-mono">
              Vocoder
            </span>
          </span>
          <span className="font-mono text-sm font-bold text-slate-100">
            {formatPercent(prosodyAnomalyScore)}
          </span>
        </div>
        <div className="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-sm ${getProsodyColor(prosodyPercent)}`}
            style={{ width: `${prosodyPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
          <span>Smooth (0%)</span>
          <span>Robotic/Glitch (100%)</span>
        </div>
      </div>
    </div>
  );
};
