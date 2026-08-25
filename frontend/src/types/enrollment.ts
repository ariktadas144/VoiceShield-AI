export type EnrollmentStatus = 'ENROLLED' | 'PENDING' | 'NOT_ENROLLED' | 'PROCESSING';

export interface VoiceProfileSample {
  id: string;
  createdAt: string;
  durationSeconds: number;
  qualityScore: number;
  sampleRate: number;
  fileName: string;
}

export interface EnrolledIdentity {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  status: EnrollmentStatus;
  enrolledAt?: string;
  samplesCount: number;
  voiceVectorModel?: string;
  lastVerifiedAt?: string;
  samples?: VoiceProfileSample[];
}

export interface EnrollmentRequest {
  identityId: string;
  audioBlob: Blob;
  durationSeconds: number;
  notes?: string;
}
