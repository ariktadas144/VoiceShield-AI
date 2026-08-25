export const CHUNK_INTERVAL_MS = 3000;
export const MAX_TIMELINE_POINTS = 30; // Rolling window of ~90 seconds (30 points * 3s)

export const RISK_THRESHOLDS = {
  LOW_MAX: 30,
  MEDIUM_MAX: 60,
  HIGH_MAX: 75,
  CRITICAL_MIN: 76,
} as const;

export const RISK_LEVELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
} as const;

export const RISK_COLORS = {
  Low: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    hex: '#10b981',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
  },
  Medium: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    hex: '#f59e0b',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
  },
  High: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    hex: '#f97316',
    glow: 'shadow-[0_0_25px_rgba(249,115,22,0.3)]',
  },
  Critical: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
    text: 'text-red-400',
    badge: 'bg-red-500/25 text-red-300 border-red-500/50',
    hex: '#ef4444',
    glow: 'shadow-[0_0_30px_rgba(239,68,68,0.4)]',
  },
} as const;

export const DEFAULT_IDENTITIES = [
  { id: 'ceo', name: 'Sarah Jenkins', role: 'Chief Executive Officer', phone: '+1 (555) 019-2834', email: 'sarah.jenkins@acmecorp.com', enrolled: true },
  { id: 'cfo', name: 'Michael Chang', role: 'Chief Financial Officer', phone: '+1 (555) 019-7482', email: 'michael.chang@acmecorp.com', enrolled: true },
  { id: 'vp-eng', name: 'Elena Rostova', role: 'VP of Engineering', phone: '+1 (555) 019-3391', email: 'elena.rostova@acmecorp.com', enrolled: true },
  { id: 'hr-dir', name: 'David Kim', role: 'HR Director', phone: '+1 (555) 019-5510', email: 'david.kim@acmecorp.com', enrolled: false },
  { id: 'unknown', name: 'Unknown / External Caller', role: 'External', phone: 'Unknown', email: 'N/A', enrolled: false },
] as const;
