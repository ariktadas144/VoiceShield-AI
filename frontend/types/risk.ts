export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface RiskEvent {
  type: "risk_update";
  sessionId: string;
  seq?: number;
  riskScore: number;            // 0 - 100
  riskLevel: RiskLevel;
  deepfakeProbability: number;  // 0 - 100
  speakerScore: number;         // 0 - 100
  anomalyScore: number;         // 0 - 100 (Acoustic / Prosody Anomaly)
  recommendedAction: string;
  timestamp: number;
}

export interface AlertEvent {
  type: "alert";
  sessionId: string;
  severity: RiskLevel;
  reason: string;
  recommendedAction: string;
  timestamp: number;
}

export interface TimeSeriesPoint {
  t: number;      // timestamp or formatted time / index label
  value: number;  // score value (0 - 100)
}
