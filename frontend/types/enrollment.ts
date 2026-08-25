import { ClaimedIdentity } from "./session";

export type EnrollmentStatus = "Enrolled" | "Pending" | "Not Enrolled";

export interface EnrolledIdentity {
  id: string;
  name: string;
  role: ClaimedIdentity;
  department: string;
  status: EnrollmentStatus;
  sampleCount: number;
  lastUpdated: string;
  qualityScore: number; // 0 - 100
  phoneContact: string;
}
