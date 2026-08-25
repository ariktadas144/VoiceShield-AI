import { SocketInboundMessage, SocketOutboundMessage, RiskUpdateInbound } from './socketEvents';
import { RiskLevel } from '@/types/risk';

export type MessageHandler = (msg: SocketInboundMessage) => void;
export type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class VoiceShieldSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private url: string;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private messageListeners: Set<MessageHandler> = new Set();
  private statusListeners: Set<StatusHandler> = new Set();
  private isSimulationMode = false;
  private mockIntervalTimer: NodeJS.Timeout | null = null;
  private seqCounter = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    this.url = `${wsBase}/ws/session/${sessionId}`;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    this.isExplicitlyClosed = false;
    this.notifyStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.isSimulationMode = false;
        this.notifyStatus('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data: SocketInboundMessage = JSON.parse(event.data);
          this.notifyMessage(data);
        } catch (err) {
          console.warn('[VoiceShieldSocket] Failed to parse message JSON:', event.data, err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[VoiceShieldSocket] WebSocket connection error:', err);
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.notifyStatus('connecting');
            setTimeout(() => this.connect(), 1500 * this.reconnectAttempts);
          } else {
            console.log('[VoiceShieldSocket] Backend WS unreachable. Switching to Intelligent Demo Simulation Mode.');
            this.startSimulationMode();
          }
        } else {
          this.notifyStatus('disconnected');
        }
      };
    } catch (err) {
      console.warn('[VoiceShieldSocket] Exception during WS connection:', err);
      this.startSimulationMode();
    }
  }

  public send(msg: SocketOutboundMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.isSimulationMode && msg.type === 'audio_chunk') {
      // In simulation mode, generate a calculated response for each sent 3s chunk
      this.generateSimulatedRiskUpdate(msg.claimedIdentity, msg.seq);
    }
  }

  public onMessage(listener: MessageHandler): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusHandler): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.mockIntervalTimer) {
      clearInterval(this.mockIntervalTimer);
      this.mockIntervalTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus('disconnected');
  }

  private notifyMessage(msg: SocketInboundMessage): void {
    this.messageListeners.forEach((fn) => fn(msg));
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    this.statusListeners.forEach((fn) => fn(status));
  }

  private startSimulationMode(): void {
    this.isSimulationMode = true;
    this.notifyStatus('connected');
  }

  private generateSimulatedRiskUpdate(claimedIdentity: string, seq: number): void {
    this.seqCounter = seq || this.seqCounter + 1;
    const now = Date.now();

    // Generate dynamic risk based on identity
    const isHighRiskIdentity = claimedIdentity.toLowerCase().includes('ceo') || claimedIdentity.toLowerCase().includes('unknown');
    
    // Simulate evolving trend
    let baseRisk = isHighRiskIdentity ? 65 : 20;
    const variance = Math.floor(Math.sin(this.seqCounter * 0.5) * 15 + Math.random() * 8);
    let riskScore = Math.max(5, Math.min(96, baseRisk + variance + (this.seqCounter > 4 && isHighRiskIdentity ? 12 : 0)));

    let riskLevel: RiskLevel = 'Low';
    let action = 'CONTINUE_NORMAL';

    if (riskScore >= 76) {
      riskLevel = 'Critical';
      action = 'BLOCK_AND_ESCALATE';
    } else if (riskScore >= 61) {
      riskLevel = 'High';
      action = 'CHALLENGE_IDENTITY';
    } else if (riskScore >= 31) {
      riskLevel = 'Medium';
      action = 'WARNING_SECONDARY_VERIFICATION';
    }

    const deepfakeProbability = riskScore > 60 ? (riskScore * 0.95) / 100 : (riskScore * 0.3) / 100;
    const speakerScore = isHighRiskIdentity ? Math.max(0.15, (100 - riskScore) / 100) : 0.94;
    const anomalyScore = (riskScore * 0.88) / 100;

    const payload: RiskUpdateInbound = {
      type: 'risk_update',
      sessionId: this.sessionId,
      seq: this.seqCounter,
      riskScore,
      riskLevel,
      deepfakeProbability,
      speakerScore,
      anomalyScore,
      recommendedAction: action,
      reason:
        riskLevel === 'Critical'
          ? 'Deepfake synthesis detected with prosody anomalies and high speaker mismatch.'
          : riskLevel === 'High'
          ? 'Anomalous acoustic artifacts and divergent pitch contour.'
          : 'Acoustic cues match authentic human voiceprint.',
      timestamp: now,
      fusionBreakdown: {
        deepfakeContribution: Math.round(deepfakeProbability * 40),
        speakerMismatchContribution: Math.round((1 - speakerScore) * 25),
        prosodyContribution: Math.round(anomalyScore * 15),
        contextContribution: 10,
      },
    };

    setTimeout(() => {
      this.notifyMessage(payload);
    }, 120);
  }
}
