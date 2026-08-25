import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { RiskEvent } from '../../types/risk';
import { formatDuration } from '../../lib/formatters';

interface RiskTimelineProps {
  timeline: RiskEvent[];
  height?: number;
  className?: string;
}

export const RiskTimeline: React.FC<RiskTimelineProps> = ({
  timeline,
  height = 180,
  className = '',
}) => {
  // Format timeline data for Recharts
  const chartData = timeline.map((item, index) => ({
    index: item.window_seq ?? index,
    time: formatDuration(item.audio_time_s ?? index * 0.5),
    rawTime: item.audio_time_s ?? index * 0.5,
    riskScore: item.riskScore,
    deepfakeProb: Math.round(item.deepfakeProbability * 100),
    speakerMatch: Math.round(item.speakerScore * 100),
    level: item.riskLevel,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-lg shadow-xl backdrop-blur-md text-xs space-y-1">
          <div className="font-mono text-slate-400 font-bold border-b border-slate-800 pb-1">
            Time: {data.time} (Window #{data.index})
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Total Risk:</span>
            <span className="font-mono font-bold text-red-400">{data.riskScore}/100</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Deepfake Prob:</span>
            <span className="font-mono font-semibold text-purple-400">{data.deepfakeProb}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Speaker Match:</span>
            <span className="font-mono font-semibold text-cyan-400">{data.speakerMatch}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center border border-slate-800/80 rounded-xl bg-slate-900/40 text-slate-500 text-xs font-mono p-6 ${className}`}
        style={{ height }}
      >
        <span className="animate-pulse">Awaiting live audio stream frames...</span>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="riskTimelineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Risk Threshold Reference Lines */}
          <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="2 2" strokeOpacity={0.5} label={{ value: 'Critical', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
          <ReferenceLine y={60} stroke="#f97316" strokeDasharray="2 2" strokeOpacity={0.4} label={{ value: 'High', fill: '#f97316', fontSize: 9, position: 'insideTopRight' }} />
          <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="2 2" strokeOpacity={0.3} label={{ value: 'Medium', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }} />

          <Area
            type="monotone"
            dataKey="riskScore"
            stroke="#ef4444"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#riskTimelineGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
