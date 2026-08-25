'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { TimePoint } from '@/types/risk';
import { Activity } from 'lucide-react';

interface RiskTimelineProps {
  data: TimePoint[];
  isLive?: boolean;
  className?: string;
}

export default function RiskTimeline({ data, isLive = true, className = '' }: RiskTimelineProps) {
  // If no data, display a placeholder line
  const chartData = data.length > 0 ? data : [{ t: Date.now(), timeLabel: '--:--', value: 0 }];

  return (
    <div className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Live Risk Score Graph
              {isLive && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  3s STREAM
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Rolling 90s time-series telemetric window ({chartData.length} chunks)
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Low &lt;30
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Med 31-60
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> High 61-75
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Crit &gt;75
          </span>
        </div>
      </div>

      {/* Chart container */}
      <div className="w-full h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 60, 75, 100]}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />

            {/* Threshold Reference Lines */}
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={60} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const val = payload[0].value as number;
                  const item = payload[0].payload as TimePoint;
                  return (
                    <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-mono">
                      <div className="text-slate-400">{item.timeLabel}</div>
                      <div className="text-sm font-bold text-white mt-1">
                        Risk Score: <span className="text-indigo-400">{val} / 100</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke="#818cf8"
              strokeWidth={3}
              dot={{ r: 3, fill: '#6366f1', strokeWidth: 1, stroke: '#e0e7ff' }}
              activeDot={{ r: 5, fill: '#a855f7', stroke: '#fff' }}
              isAnimationActive={false} // Instant live telemetry updates
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
