import { RISK_THRESHOLDS, RISK_COLORS, RISK_LEVELS } from '@/lib/constants';
import { RiskLevel } from '@/types/risk';

export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.CRITICAL_MIN) return RISK_LEVELS.CRITICAL;
  if (score > RISK_THRESHOLDS.MEDIUM_MAX) return RISK_LEVELS.HIGH;
  if (score > RISK_THRESHOLDS.LOW_MAX) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.LOW;
}

export function getRiskTheme(level: RiskLevel) {
  return RISK_COLORS[level] || RISK_COLORS.Low;
}

export function getRecommendedActionText(level: RiskLevel): {
  title: string;
  description: string;
  badgeClass: string;
} {
  switch (level) {
    case 'Critical':
      return {
        title: 'CRITICAL THREAT DETECTED',
        description: 'Synthetic voice clone detected with high confidence. Immediate block and security escalation required.',
        badgeClass: 'bg-red-500 text-white',
      };
    case 'High':
      return {
        title: 'HIGH RISK CALLER',
        description: 'Probable voice clone or significant acoustic mismatch. Secondary out-of-band identity verification mandatory.',
        badgeClass: 'bg-orange-500 text-white',
      };
    case 'Medium':
      return {
        title: 'SUSPICIOUS PATTERNS',
        description: 'Unusual prosodic variations or partial voiceprint mismatch. Exercise caution with confidential inquiries.',
        badgeClass: 'bg-amber-500 text-slate-950',
      };
    case 'Low':
    default:
      return {
        title: 'AUTHENTIC SPEECH PATTERNS',
        description: 'All acoustic and speaker verification metrics align with genuine human speech.',
        badgeClass: 'bg-emerald-500 text-white',
      };
  }
}
