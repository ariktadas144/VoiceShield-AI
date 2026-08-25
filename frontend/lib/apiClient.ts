import axios from 'axios';
import { Incident, IncidentFilters, IncidentStatus } from '@/types/incident';
import { EnrolledIdentity, VoiceEnrollmentRequest } from '@/types/enrollment';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mock in-memory database for resilient local testing/demo fallback
let mockIncidents: Incident[] = [
  {
    id: 'INC-8942',
    sessionId: 'sess_982348',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    claimedIdentity: 'Sarah Jenkins (CEO)',
    callerNumber: '+1 (555) 839-2041 (Spoofed)',
    riskScore: 88,
    riskLevel: 'Critical',
    deepfakeProbability: 0.94,
    speakerScore: 0.22,
    anomalyScore: 0.82,
    status: 'OPEN',
    recommendedAction: 'BLOCK_AND_ESCALATE',
    actionTaken: 'Call terminated. Wire transfer of $450,000 halted.',
    notes: 'Caller demanded immediate confidential treasury transfer to offshore entity.',
    reviewer: 'Security Analyst 04',
  },
  {
    id: 'INC-8941',
    sessionId: 'sess_982312',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    claimedIdentity: 'Michael Chang (CFO)',
    callerNumber: '+1 (555) 773-1092',
    riskScore: 68,
    riskLevel: 'High',
    deepfakeProbability: 0.72,
    speakerScore: 0.41,
    anomalyScore: 0.65,
    status: 'UNDER_REVIEW',
    recommendedAction: 'CHALLENGE_IDENTITY',
    actionTaken: 'Secondary OTP challenge dispatched.',
    notes: 'Voice sounded raspy with synthetic prosodic anomalies on phoneme transitions.',
    reviewer: 'Security Analyst 02',
  },
  {
    id: 'INC-8939',
    sessionId: 'sess_981990',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    claimedIdentity: 'Elena Rostova (VP Eng)',
    callerNumber: '+1 (555) 019-3391',
    riskScore: 18,
    riskLevel: 'Low',
    deepfakeProbability: 0.08,
    speakerScore: 0.96,
    anomalyScore: 0.12,
    status: 'RESOLVED',
    recommendedAction: 'CONTINUE_NORMAL',
    actionTaken: 'Identity confirmed genuine.',
    notes: 'Verified scheduled sprint review access request.',
    reviewer: 'System Automated',
  },
  {
    id: 'INC-8938',
    sessionId: 'sess_981440',
    timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    claimedIdentity: 'Unknown External Caller',
    callerNumber: '+44 20 7946 0912',
    riskScore: 78,
    riskLevel: 'Critical',
    deepfakeProbability: 0.89,
    speakerScore: 0.15,
    anomalyScore: 0.74,
    status: 'RESOLVED',
    recommendedAction: 'BLOCK_AND_ESCALATE',
    actionTaken: 'Number blacklisted in SIP gateway.',
    notes: 'Attempted social engineering of IT helpdesk password reset.',
    reviewer: 'Security Analyst 01',
  },
];

let mockIdentities: EnrolledIdentity[] = [
  {
    id: 'ceo',
    name: 'Sarah Jenkins',
    role: 'Chief Executive Officer',
    department: 'Executive Leadership',
    phone: '+1 (555) 019-2834',
    email: 'sarah.jenkins@acmecorp.com',
    isEnrolled: true,
    sampleCount: 4,
    lastUpdated: '2026-08-15',
    voiceprintConfidence: 0.98,
  },
  {
    id: 'cfo',
    name: 'Michael Chang',
    role: 'Chief Financial Officer',
    department: 'Finance & Treasury',
    phone: '+1 (555) 019-7482',
    email: 'michael.chang@acmecorp.com',
    isEnrolled: true,
    sampleCount: 3,
    lastUpdated: '2026-08-18',
    voiceprintConfidence: 0.95,
  },
  {
    id: 'vp-eng',
    name: 'Elena Rostova',
    role: 'VP of Engineering',
    department: 'Engineering & R&D',
    phone: '+1 (555) 019-3391',
    email: 'elena.rostova@acmecorp.com',
    isEnrolled: true,
    sampleCount: 2,
    lastUpdated: '2026-08-20',
    voiceprintConfidence: 0.94,
  },
  {
    id: 'hr-dir',
    name: 'David Kim',
    role: 'HR Director',
    department: 'People Operations',
    phone: '+1 (555) 019-5510',
    email: 'david.kim@acmecorp.com',
    isEnrolled: false,
    sampleCount: 0,
  },
  {
    id: 'unknown',
    name: 'Unknown Caller',
    role: 'Unregistered / External',
    department: 'External',
    phone: 'Unregistered',
    email: 'unregistered@external.org',
    isEnrolled: false,
    sampleCount: 0,
  }
];

export const apiClient = {
  // Dashboard Summary
  async getDashboardSummary() {
    try {
      const res = await api.get('/api/dashboard/summary');
      return res.data;
    } catch {
      // Return realistic calculated summary
      const totalVerifications = 142;
      const highRisk = mockIncidents.filter((i) => i.riskLevel === 'High' || i.riskLevel === 'Critical').length + 8;
      const totalIncidents = mockIncidents.length + 15;
      const resolvedIncidents = mockIncidents.filter((i) => i.status === 'RESOLVED').length + 12;

      return {
        totalVerifications,
        highRiskDetections: highRisk,
        incidentsReported: totalIncidents,
        resolvedIncidents,
        riskDistribution: {
          low: 88,
          medium: 32,
          high: 14,
          critical: 8,
        },
      };
    }
  },

  // Dashboard Recent Activity
  async getRecentActivity() {
    try {
      const res = await api.get('/api/dashboard/recent-activity');
      return res.data;
    } catch {
      return [
        {
          id: 'act-1',
          type: 'INCIDENT_FLAGGED',
          title: 'Critical Impersonation Alert',
          description: 'Synthetic voice pattern detected claiming identity of Sarah Jenkins (CEO)',
          timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          riskScore: 88,
          riskLevel: 'Critical',
        },
        {
          id: 'act-2',
          type: 'SECONDARY_VERIFY',
          title: 'Secondary MFA Verification Sent',
          description: 'Out-of-band challenge dispatched to Michael Chang (+1-555-019-7482)',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          riskScore: 68,
          riskLevel: 'High',
        },
        {
          id: 'act-3',
          type: 'ENROLLMENT_UPDATED',
          title: 'Voiceprint Updated',
          description: 'Elena Rostova (VP Eng) added 2 high-fidelity reference audio samples',
          timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
          riskScore: null,
          riskLevel: null,
        },
        {
          id: 'act-4',
          type: 'VERIFICATION_PASSED',
          title: 'Live Call Verified',
          description: 'Identity match 96% genuine human prosody for Elena Rostova',
          timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
          riskScore: 18,
          riskLevel: 'Low',
        },
      ];
    }
  },

  // Incidents API
  async getIncidents(filters?: IncidentFilters) {
    try {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);
      if (filters?.riskLevel && filters.riskLevel !== 'ALL') params.append('riskLevel', filters.riskLevel);
      if (filters?.search) params.append('search', filters.search);
      const res = await api.get(`/api/incidents?${params.toString()}`);
      return res.data;
    } catch {
      let filtered = [...mockIncidents];
      if (filters?.status && filters.status !== 'ALL') {
        filtered = filtered.filter((i) => i.status === filters.status);
      }
      if (filters?.riskLevel && filters.riskLevel !== 'ALL') {
        filtered = filtered.filter((i) => i.riskLevel === filters.riskLevel);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.claimedIdentity.toLowerCase().includes(q) ||
            i.id.toLowerCase().includes(q) ||
            (i.callerNumber && i.callerNumber.toLowerCase().includes(q))
        );
      }
      return filtered;
    }
  },

  async getIncidentById(id: string) {
    try {
      const res = await api.get(`/api/incidents/${id}`);
      return res.data;
    } catch {
      const incident = mockIncidents.find((i) => i.id === id);
      if (!incident) throw new Error('Incident not found');
      return incident;
    }
  },

  async updateIncidentStatus(id: string, status: IncidentStatus, notes?: string) {
    try {
      const res = await api.patch(`/api/incidents/${id}`, { status, notes });
      return res.data;
    } catch {
      mockIncidents = mockIncidents.map((inc) =>
        inc.id === id ? { ...inc, status, notes: notes || inc.notes } : inc
      );
      return mockIncidents.find((inc) => inc.id === id);
    }
  },

  async createIncident(incidentData: Partial<Incident>) {
    try {
      const res = await api.post('/api/incidents', incidentData);
      return res.data;
    } catch {
      const newInc: Incident = {
        id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        sessionId: incidentData.sessionId || `sess_${Date.now()}`,
        timestamp: new Date().toISOString(),
        claimedIdentity: incidentData.claimedIdentity || 'Unknown Identity',
        callerNumber: incidentData.callerNumber || '+1 (555) 000-0000',
        riskScore: incidentData.riskScore || 80,
        riskLevel: incidentData.riskLevel || 'High',
        deepfakeProbability: incidentData.deepfakeProbability || 0.85,
        speakerScore: incidentData.speakerScore || 0.2,
        anomalyScore: incidentData.anomalyScore || 0.7,
        status: 'OPEN',
        recommendedAction: incidentData.recommendedAction || 'BLOCK_AND_ESCALATE',
        actionTaken: incidentData.actionTaken || 'Flagged by operator',
        notes: incidentData.notes || 'Automated or operator flagged incident.',
        reviewer: 'Operator Active Session',
      };
      mockIncidents.unshift(newInc);
      return newInc;
    }
  },

  // Enrollment API
  async getIdentities() {
    try {
      const res = await api.get('/api/enrollment/identities');
      return res.data;
    } catch {
      return mockIdentities;
    }
  },

  async enrollVoice(data: VoiceEnrollmentRequest) {
    try {
      const formData = new FormData();
      formData.append('identityId', data.identityId);
      formData.append('name', data.name);
      formData.append('role', data.role);
      formData.append('department', data.department);
      formData.append('phone', data.phone);
      formData.append('email', data.email);
      if (data.audioBlob) {
        formData.append('audio', data.audioBlob, 'voiceprint_sample.wav');
      }
      const res = await api.post('/api/enrollment/identities', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } catch {
      const existing = mockIdentities.find((id) => id.id === data.identityId);
      if (existing) {
        existing.isEnrolled = true;
        existing.sampleCount += 1;
        existing.lastUpdated = new Date().toISOString().split('T')[0];
        existing.voiceprintConfidence = 0.96;
        return existing;
      } else {
        const newIdentity: EnrolledIdentity = {
          id: data.identityId || `id_${Date.now()}`,
          name: data.name,
          role: data.role,
          department: data.department || 'Operations',
          phone: data.phone,
          email: data.email,
          isEnrolled: true,
          sampleCount: 1,
          lastUpdated: new Date().toISOString().split('T')[0],
          voiceprintConfidence: 0.95,
        };
        mockIdentities.push(newIdentity);
        return newIdentity;
      }
    }
  },

  // Secondary Verification
  async initiateSecondaryVerification(payload: {
    sessionId: string;
    identityId: string;
    method: 'phone' | 'email_otp' | 'mfa_push' | 'manager_escalate';
  }) {
    try {
      const res = await api.post('/api/verification/secondary', payload);
      return res.data;
    } catch {
      return {
        verificationId: `VER-${Math.floor(10000 + Math.random() * 90000)}`,
        sessionId: payload.sessionId,
        method: payload.method,
        status: 'PENDING',
        dispatchedAt: new Date().toISOString(),
        expiresInSeconds: 300,
      };
    }
  },

  async updateSecondaryVerificationStatus(verificationId: string, status: 'VERIFIED' | 'FAILED' | 'ESCALATED') {
    try {
      const res = await api.patch(`/api/verification/secondary/${verificationId}`, { status });
      return res.data;
    } catch {
      return {
        verificationId,
        status,
        updatedAt: new Date().toISOString(),
      };
    }
  },
};
