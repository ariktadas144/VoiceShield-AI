import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

interface RiskDistributionChartProps {
  distribution?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  isLoading?: boolean;
}

export const RiskDistributionChart: React.FC<RiskDistributionChartProps> = ({
  distribution = { low: 940, medium: 266, high: 31, critical: 11 },
  isLoading = false,
}) => {
  const data = [
    { name: 'Low Risk (<31)', value: distribution.low, color: '#10b981' },
    { name: 'Medium Risk (31-60)', value: distribution.medium, color: '#f59e0b' },
    { name: 'High Risk (61-75)', value: distribution.high, color: '#f97316' },
    { name: 'Critical (76+)', value: distribution.critical, color: '#ef4444' },
  ];

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg shadow-xl backdrop-blur-md text-xs">
          <span className="font-bold block" style={{ color: item.payload.color }}>
            {item.name}
          </span>
          <span className="font-mono text-slate-200 mt-1 block">
            {item.value.toLocaleString()} sessions ({percent}%)
          </span>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-slate-900/50 animate-pulse" />;
  }

  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-100 tracking-wide">
            Risk Distribution
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Breakdown across all analyzed voice interactions
          </p>
        </div>
        <span className="font-mono text-xs text-slate-400 font-semibold bg-slate-800/80 px-2 py-1 rounded-lg">
          {total.toLocaleString()} Total Calls
        </span>
      </div>

      <div className="w-full h-56 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={data}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#0b0f19" strokeWidth={2} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry: any) => (
                <span className="text-[11px] font-semibold text-slate-300 ml-1">
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
