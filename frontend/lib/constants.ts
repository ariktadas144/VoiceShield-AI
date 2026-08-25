import { RiskLevel } from "@/types/risk";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// Real-time Audio Chunk Cadence
export const CHUNK_DURATION_MS = 3000; // 3-second heartbeat

// Rolling window limit for live time-series graphs
export const MAX_TIMELINE_POINTS = 30; // ~90 seconds of history

// Risk Score Thresholds
export const RISK_THRESHOLDS = {
  LOW_MAX: 30,       // 0 - 30
  MEDIUM_MAX: 60,    // 31 - 60
  HIGH_MAX: 75,      // 61 - 75
  CRITICAL_MIN: 76,  // 76 - 100
};

export const RISK_COLORS = {
  Low: {
    bg: "bg-emerald-950/60",
    text: "text-emerald-400",
    border: "border-emerald-500/40",
    hex: "#10b981",
    glow: "rgba(16, 185, 129, 0.3)",
  },
  Medium: {
    bg: "bg-amber-950/60",
    text: "text-amber-400",
    border: "border-amber-500/40",
    hex: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.3)",
  },
  High: {
    bg: "bg-orange-950/60",
    text: "text-orange-400",
    border: "border-orange-500/50",
    hex: "#f97316",
    glow: "rgba(249, 115, 22, 0.4)",
  },
  Critical: {
    bg: "bg-rose-950/80",
    text: "text-rose-400",
    border: "border-rose-500/70",
    hex: "#ef4444",
    glow: "rgba(239, 68, 68, 0.6)",
  },
};

export function getRiskLevel(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.LOW_MAX) return "Low";
  if (score <= RISK_THRESHOLDS.MEDIUM_MAX) return "Medium";
  if (score <= RISK_THRESHOLDS.HIGH_MAX) return "High";
  return "Critical";
}
