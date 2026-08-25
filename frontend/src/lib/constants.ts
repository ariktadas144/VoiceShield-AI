import { ClaimedIdentity, ClaimedIdentityRole } from '../types/session';
import { RiskLevel } from '../types/risk';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export const RISK_THRESHOLDS = {
  LOW_MAX: 30,
  MEDIUM_MAX: 60,
  HIGH_MAX: 75,
  CRITICAL_MIN: 76,
} as const;

export const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  {
    label: string;
    description: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    badgeBg: string;
    glowClass: string;
    hexColor: string;
    fillColor: string;
  }
> = {
  LOW: {
    label: 'Low Risk',
    description: 'Acoustic patterns consistent with natural speech. Safe to continue.',
    bgColor: 'bg-emerald-950/40',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    glowClass: '',
    hexColor: '#10b981',
    fillColor: '#059669',
  },
  MEDIUM: {
    label: 'Medium Risk',
    description: 'Minor acoustic artifacts detected. Recommend cautious monitoring.',
    bgColor: 'bg-amber-950/40',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    glowClass: '',
    hexColor: '#f59e0b',
    fillColor: '#d97706',
  },
  HIGH: {
    label: 'High Risk',
    description: 'Significant synthetic vocal characteristics. Initiate secondary verification immediately.',
    bgColor: 'bg-orange-950/50',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-500/40',
    badgeBg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    glowClass: 'animate-glow-high',
    hexColor: '#f97316',
    fillColor: '#ea580c',
  },
  CRITICAL: {
    label: 'Critical Alert',
    description: 'High confidence deepfake impersonation detected. Block transaction and escalate to Security.',
    bgColor: 'bg-red-950/60',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/60',
    badgeBg: 'bg-red-500/20 text-red-400 border-red-500/50',
    glowClass: 'animate-glow-critical',
    hexColor: '#ef4444',
    fillColor: '#dc2626',
  },
};

export const DEFAULT_CLAIMED_IDENTITIES: ClaimedIdentity[] = [
  {
    id: 'id-ceo',
    name: 'Alexander Vance',
    role: 'CEO',
    department: 'Executive Leadership',
    officialPhone: '+1 (555) 234-5678',
    officialEmail: 'a.vance@enterprise-corp.internal',
    hasVoiceProfile: true,
    confidenceThreshold: 85,
  },
  {
    id: 'id-cfo',
    name: 'Elena Rostova',
    role: 'CFO',
    department: 'Treasury & Finance',
    officialPhone: '+1 (555) 345-6789',
    officialEmail: 'e.rostova@enterprise-corp.internal',
    hasVoiceProfile: true,
    confidenceThreshold: 85,
  },
  {
    id: 'id-vp-eng',
    name: 'Marcus Chen',
    role: 'VP Engineering',
    department: 'Product & Tech',
    officialPhone: '+1 (555) 456-7890',
    officialEmail: 'm.chen@enterprise-corp.internal',
    hasVoiceProfile: true,
    confidenceThreshold: 80,
  },
  {
    id: 'id-finance-dir',
    name: 'Sarah Jenkins',
    role: 'Finance Director',
    department: 'Global Payroll & Wires',
    officialPhone: '+1 (555) 567-8901',
    officialEmail: 's.jenkins@enterprise-corp.internal',
    hasVoiceProfile: false,
    confidenceThreshold: 75,
  },
  {
    id: 'id-unknown',
    name: 'Unverified External Caller',
    role: 'Unknown Caller',
    department: 'External Inbound',
    officialPhone: 'Hidden / Caller ID Spoofed',
    officialEmail: 'unregistered@external.org',
    hasVoiceProfile: false,
    confidenceThreshold: 70,
  },
];
