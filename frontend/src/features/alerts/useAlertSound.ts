import { useRef, useCallback } from 'react';
import { RiskLevel } from '../../types/risk';

export function useAlertSound() {
  const lastPlayedLevelRef = useRef<RiskLevel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playAlertChime = useCallback((level: RiskLevel) => {
    // Only play for High or Critical
    if (level !== 'HIGH' && level !== 'CRITICAL') return;
    
    // Prevent spamming the sound on every 500ms hop if level hasn't changed
    if (lastPlayedLevelRef.current === level) return;
    lastPlayedLevelRef.current = level;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextClass();
      }
      
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (level === 'CRITICAL') {
        // Urgent dual-tone siren
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.6);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
      } else {
        // High risk warning double-beep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (err) {
      console.warn('Could not play alert chime:', err);
    }
  }, []);

  const resetAlertSound = useCallback(() => {
    lastPlayedLevelRef.current = null;
  }, []);

  return { playAlertChime, resetAlertSound };
}
