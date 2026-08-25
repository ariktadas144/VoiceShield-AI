"use client";

import { useLiveSessionStore } from "@/store/liveSessionStore";
import { formatTimeLabel } from "@/lib/formatters";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

export default function AnomalyDetectionChart() {
  const anomalyScoreHistory = useLiveSessionStore((s) => s.anomalyScoreHistory);
  const isStreaming = useLiveSessionStore((s) => s.isStreaming);

  const formattedData = anomalyScoreHistory.map((pt, idx) => ({
    timeLabel: formatTimeLabel(pt.t),
    anomalyScore: pt.value,
    idx,
  }));

  return (
    <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono">
            Acoustic & Prosody Anomaly Graph
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {isStreaming ? "LIVE ANOMALY STREAM" : "SESSION FROZEN"}
        </span>
      </div>

      <div className="w-full h-[180px]">
        {formattedData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
            Awaiting WebSocket stream initialization...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="timeLabel"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  fontSize: "11px",
                }}
              />
              <ReferenceLine y={60} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: "Anomaly Threshold (60)", fill: "#06b6d4", fontSize: 9 }} />
              <Line
                type="monotone"
                dataKey="anomalyScore"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ fill: "#06b6d4", r: 3 }}
                activeDot={{ r: 5, fill: "#38bdf8" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
