export interface EnrolledIdentity {
  id: string;
  name: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  isEnrolled: boolean;
  sampleCount: number;
  lastUpdated?: string;
  voiceprintConfidence?: number;
  sampleUrl?: string;
}

export interface VoiceEnrollmentRequest {
  identityId: string;
  name: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  audioBlob?: Blob;
  audioBase64?: string;
}
