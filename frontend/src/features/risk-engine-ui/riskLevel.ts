import { RiskLevel, RecommendedAction } from '../../types/risk';
import { RISK_THRESHOLDS, RISK_LEVEL_CONFIG } from '../../lib/constants';

export function getRiskLevelFromScore(score: number): RiskLevel {
  if (isNaN(score) || score < 0) return 'LOW';
  if (score <= RISK_THRESHOLDS.LOW_MAX) return 'LOW';
  if (score <= RISK_THRESHOLDS.MEDIUM_MAX) return 'MEDIUM';
  if (score <= RISK_THRESHOLDS.HIGH_MAX) return 'HIGH';
  return 'CRITICAL';
}

export function getRiskConfig(level: RiskLevel) {
  return RISK_LEVEL_CONFIG[level] || RISK_LEVEL_CONFIG.LOW;
}

export function getRecommendedActionText(action?: RecommendedAction | string): {
  title: string;
  instruction: string;
  badgeStyle: string;
} {
  switch (action) {
    case 'CONTINUE':
    case 'ALLOWED':
      return {
        title: 'Safe to Proceed',
        instruction: 'Voice biometrics align with genuine baseline. No immediate security intervention required.',
        badgeStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      };
    case 'WARNING_SECONDARY_VERIFICATION':
    case 'WARNING':
    case 'SECONDARY_VERIFICATION_REQUIRED':
      return {
        title: 'Secondary Verification Recommended',
        instruction: 'Discrepancies found in prosodic structure. Request out-of-band verification before approving high-value requests.',
        badgeStyle: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      };
    case 'BLOCK_AND_ESCALATE':
    case 'TRANSACTION_HELD':
    case 'BLOCKED':
    case 'IMMEDIATE_TERMINATION':
      return {
        title: 'Block Transaction & Escalate',
        instruction: 'High likelihood of neural voice synthesis / deepfake. Suspend session, hold all assets, and notify SecOps.',
        badgeStyle: 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse',
      };
    default:
      return {
        title: 'Evaluating Stream...',
        instruction: 'Listening for acoustic and vocoder artifacts in the active audio stream.',
        badgeStyle: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      };
  }
}
