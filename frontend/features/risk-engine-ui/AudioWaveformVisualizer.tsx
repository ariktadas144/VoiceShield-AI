"use client";

import { useLiveSessionStore } from "@/store/liveSessionStore";

export default function AudioWaveformVisualizer({ audioLevel = 0 }: { audioLevel?: number }) {
  const isStreaming = useLiveSessionStore((s) => s.isStreaming);
  const bars = [25, 45, 75, 90, 60, 30, 70, 85, 40, 95, 50, 65, 35, 80, 20, 55];

  return (
    <div className="flex items-center justify-between gap-1 h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden w-full">
      <div className="flex items-center gap-1.5 flex-1 justify-center h-full">
        {bars.map((baseHeight, idx) => {
          const dynamicHeight = isStreaming
            ? Math.max(15, Math.min(100, (baseHeight * (audioLevel || 40)) / 50))
            : 10;

          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-75 ${
                isStreaming
                  ? "bg-gradient-to-t from-cyan-600 to-blue-400"
                  : "bg-slate-800"
              }`}
              style={{ height: `${dynamicHeight}%` }}
            ></div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${
            isStreaming ? "bg-emerald-400 animate-ping" : "bg-slate-700"
          }`}
        ></span>
        <span className="text-[10px] font-mono text-slate-400 uppercase">
          {isStreaming ? "AUDIO ACTIVE" : "IDLE"}
        </span>
      </div>
    </div>
  );
}
