export type ClaimedIdentity = "CEO" | "CFO" | "Manager" | "Unknown";

export type ConnectionStatus = "disconnected" | "connecting" | "live" | "error";

export type AudioSourceType = "mic" | "upload";

export interface SessionState {
  sessionId: string;
  connectionStatus: ConnectionStatus;
  audioSource: AudioSourceType;
  claimedIdentity: ClaimedIdentity;
  isStreaming: boolean;
  startTime: number | null;
}
