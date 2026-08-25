'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Shield } from 'lucide-react';

interface RiskDistributionChartProps {
  distribution?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  isLoading?: boolean;
}

export default function RiskDistributionChart({
  distribution = { low: 88, medium: 32, high: 14, critical: 8 },
}: RiskDistributionChartProps) {
  const data = [
    { name: 'Low Risk', count: distribution.low, color: '#10b981' },
    { name: 'Medium', count: distribution.medium, color: '#f59e0b' },
    { name: 'High', count: distribution.high, color: '#f97316' },
    { name: 'Critical', count: distribution.critical, color: '#ef4444' },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          Call Risk Distribution
        </h3>
        <span className="text-xs font-mono text-slate-400">Total: 142 Calls</span>
      </div>

      <div className="w-full h-64 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-mono">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <div className="text-indigo-400 font-bold mt-0.5">
                        {item.count} Verifications
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
