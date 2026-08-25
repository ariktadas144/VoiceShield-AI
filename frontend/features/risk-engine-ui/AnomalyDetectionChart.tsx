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
import { AudioWaveform } from 'lucide-react';

interface AnomalyDetectionChartProps {
  data: TimePoint[];
  isLive?: boolean;
  className?: string;
}

export default function AnomalyDetectionChart({
  data,
  isLive = true,
  className = '',
}: AnomalyDetectionChartProps) {
  const chartData = data.length > 0 ? data : [{ t: Date.now(), timeLabel: '--:--', value: 0 }];

  return (
    <div className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
            <AudioWaveform className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Anomaly Detection Graph
              {isLive && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping" />
                  ACOUSTIC / PROSODY
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Synchronous temporal anomalies &amp; phonemic jitter tracking
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-pink-400/80">
          <span>Target Baseline: &lt;25%</span>
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
              ticks={[0, 25, 50, 75, 100]}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />

            {/* Threshold Anomaly Line */}
            <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" strokeOpacity={0.4} />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const val = payload[0].value as number;
                  const item = payload[0].payload as TimePoint;
                  return (
                    <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-mono">
                      <div className="text-slate-400">{item.timeLabel}</div>
                      <div className="text-sm font-bold text-white mt-1">
                        Anomaly Score: <span className="text-pink-400">{val}%</span>
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
              stroke="#ec4899"
              strokeWidth={3}
              dot={{ r: 3, fill: '#db2777', strokeWidth: 1, stroke: '#fbcfe8' }}
              activeDot={{ r: 5, fill: '#f43f5e', stroke: '#fff' }}
              isAnimationActive={false} // Instant live telemetry updates
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
