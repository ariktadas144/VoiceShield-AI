import { WsInboundMessage, WsOutboundControl } from './socketEvents';
import { WS_BASE_URL } from '../../lib/constants';

export type MessageListener = (msg: WsInboundMessage) => void;
export type StatusListener = (status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error') => void;

export interface SocketClientOptions {
  url?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  headers?: Record<string, string>;
}

export class VoiceShieldSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private isIntentionallyClosed = false;

  private messageListeners: Set<MessageListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  constructor(options: SocketClientOptions = {}) {
    this.url = options.url || `${WS_BASE_URL}/api/analyze-stream`;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  public connect(customUrl?: string) {
    if (customUrl) {
      this.url = customUrl;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.notifyStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyStatus('connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          try {
            const parsed: WsInboundMessage = JSON.parse(event.data);
            this.notifyMessage(parsed);
          } catch (err) {
            console.warn('Failed to parse WebSocket JSON:', event.data, err);
          }
        }
      };

      this.onerror = (event: Event) => {
        console.warn('WebSocket error:', event);
        this.notifyStatus('error');
      };

      this.ws.onclose = (event: CloseEvent) => {
        if (!this.isIntentionallyClosed) {
          this.notifyStatus('disconnected');
          this.handleReconnect();
        } else {
          this.notifyStatus('disconnected');
        }
      };
    } catch (err) {
      console.error('WebSocket connection initialization error:', err);
      this.notifyStatus('error');
      this.handleReconnect();
    }
  }

  private set onerror(handler: (event: Event) => void) {
    if (this.ws) {
      this.ws.onerror = handler;
    }
  }

  private handleReconnect() {
    if (!this.autoReconnect || this.isIntentionallyClosed) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
      
      this.notifyStatus('reconnecting');
      this.reconnectTimer = window.setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      this.notifyStatus('error');
    }
  }

  public sendBinary(data: Float32Array | Int16Array | ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (data instanceof Float32Array || data instanceof Int16Array) {
      this.ws.send(data.buffer);
    } else {
      this.ws.send(data);
    }
    return true;
  }

  public sendControl(control: WsOutboundControl) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify(control));
    return true;
  }

  public close() {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'eof' }));
        }
        this.ws.close();
      } catch (err) {
        console.warn('Error during socket close:', err);
      }
      this.ws = null;
    }
    this.notifyStatus('disconnected');
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyMessage(msg: WsInboundMessage) {
    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in socket message listener:', err);
      }
    }
  }

  private notifyStatus(status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error') {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in socket status listener:', err);
      }
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
