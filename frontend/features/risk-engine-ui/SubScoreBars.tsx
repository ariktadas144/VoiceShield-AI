"use client";

import { useLiveSessionStore } from "@/store/liveSessionStore";

export default function SubScoreBars() {
  const latestEvent = useLiveSessionStore((s) => s.latestRiskEvent);

  const deepfakeProb = latestEvent?.deepfakeProbability ?? 5;
  const speakerMatch = latestEvent?.speakerScore ?? 92;
  const anomalyScore = latestEvent?.anomalyScore ?? 8;

  const subScores = [
    {
      name: "Deepfake Synthetic Speech Prob.",
      score: deepfakeProb,
      color: deepfakeProb > 60 ? "bg-rose-500" : deepfakeProb > 30 ? "bg-amber-500" : "bg-emerald-500",
      description: "Neural spectrogram vocoder signature analysis",
    },
    {
      name: "Speaker Biometric Verification",
      score: speakerMatch,
      color: speakerMatch < 50 ? "bg-rose-500" : speakerMatch < 75 ? "bg-amber-500" : "bg-emerald-500",
      description: "Match confidence against enrolled reference voice print",
    },
    {
      name: "Prosody & Acoustic Anomaly",
      score: anomalyScore,
      color: anomalyScore > 60 ? "bg-rose-500" : anomalyScore > 30 ? "bg-amber-500" : "bg-cyan-500",
      description: "Pitch, intonation variance & cadence micro-divergence",
    },
  ];

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
      <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
        Sub-Score Neural Signals (Latest Heartbeat)
      </h3>

      <div className="space-y-3.5">
        {subScores.map((item, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-200">{item.name}</span>
              <span className="font-mono font-bold text-slate-100">{item.score}%</span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
              <div
                className={`h-full ${item.color} transition-all duration-300 ease-out`}
                style={{ width: `${item.score}%` }}
              ></div>
            </div>

            <p className="text-[10px] text-slate-400 font-mono">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
