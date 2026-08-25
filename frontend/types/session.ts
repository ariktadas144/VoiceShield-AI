export type AudioSourceType = 'mic' | 'upload';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ClaimedIdentity {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  enrolled?: boolean;
}

export interface SessionState {
  sessionId: string;
  active: boolean;
  source: AudioSourceType;
  claimedIdentity: ClaimedIdentity | null;
  connectionStatus: ConnectionStatus;
  startedAt: number | null;
  durationSeconds: number;
}
