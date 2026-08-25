"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DistributionItem {
  name: string;
  count: number;
  fill: string;
}

export default function RiskDistributionChart({
  data,
}: {
  data?: DistributionItem[];
}) {
  const chartData = data || [
    { name: "Low", count: 1140, fill: "#10b981" },
    { name: "Medium", count: 102, fill: "#f59e0b" },
    { name: "High", count: 30, fill: "#f97316" },
    { name: "Critical", count: 12, fill: "#ef4444" },
  ];

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between h-[320px]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
          <span>Session Risk Distribution</span>
        </h2>
        <span className="text-xs text-slate-400 font-mono">Last 30 Days</span>
      </div>

      <div className="w-full h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "12px",
              }}
              cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
