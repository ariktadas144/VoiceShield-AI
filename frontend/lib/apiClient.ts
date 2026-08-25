import { API_URL } from "./constants";
import { Incident, IncidentStatus } from "@/types/incident";
import { EnrolledIdentity } from "@/types/enrollment";

// Mock Fallback Data
let mockIncidents: Incident[] = [
  {
    id: "INC-9042",
    sessionId: "SESH-881",
    claimedIdentity: "CFO",
    riskScore: 88,
    riskLevel: "Critical",
    deepfakeProbability: 94,
    speakerScore: 12,
    anomalyScore: 89,
    status: "Open",
    timestamp: "2026-08-25T19:42:00Z",
    durationSeconds: 142,
    summary: "High synthetic voice probability detected during urgent wire transfer inquiry.",
    recommendedAction: "Halt transaction. Trigger secondary MFA verification call immediately.",
  },
  {
    id: "INC-8910",
    sessionId: "SESH-750",
    claimedIdentity: "CEO",
    riskScore: 68,
    riskLevel: "High",
    deepfakeProbability: 72,
    speakerScore: 45,
    anomalyScore: 61,
    status: "Under Review",
    timestamp: "2026-08-25T17:15:00Z",
    durationSeconds: 84,
    summary: "Prosody and acoustic divergence detected during executive voice call.",
    recommendedAction: "Contact CEO on verified registered mobile phone number.",
  },
  {
    id: "INC-8744",
    sessionId: "SESH-620",
    claimedIdentity: "Manager",
    riskScore: 35,
    riskLevel: "Medium",
    deepfakeProbability: 38,
    speakerScore: 68,
    anomalyScore: 29,
    status: "Resolved",
    timestamp: "2026-08-24T14:30:00Z",
    durationSeconds: 190,
    summary: "Background noise artifact triggered mild anomaly threshold. Verified manually.",
    recommendedAction: "No further security escalation required.",
  },
  {
    id: "INC-8521",
    sessionId: "SESH-512",
    claimedIdentity: "CEO",
    riskScore: 14,
    riskLevel: "Low",
    deepfakeProbability: 8,
    speakerScore: 96,
    anomalyScore: 12,
    status: "False Positive",
    timestamp: "2026-08-23T11:05:00Z",
    durationSeconds: 310,
    summary: "Authentic speaker verification confirmed identity match.",
    recommendedAction: "Proceed normally.",
  },
];

let mockIdentities: EnrolledIdentity[] = [
  {
    id: "ID-101",
    name: "Eleanor Vance",
    role: "CEO",
    department: "Executive",
    status: "Enrolled",
    sampleCount: 5,
    lastUpdated: "2026-08-20",
    qualityScore: 98,
    phoneContact: "+1 (555) 019-2831",
  },
  {
    id: "ID-102",
    name: "Marcus Holloway",
    role: "CFO",
    department: "Finance & Treasury",
    status: "Enrolled",
    sampleCount: 4,
    lastUpdated: "2026-08-22",
    qualityScore: 95,
    phoneContact: "+1 (555) 018-9920",
  },
  {
    id: "ID-103",
    name: "Sarah Jenkins",
    role: "Manager",
    department: "Security Operations",
    status: "Enrolled",
    sampleCount: 3,
    lastUpdated: "2026-08-21",
    qualityScore: 91,
    phoneContact: "+1 (555) 014-4411",
  },
  {
    id: "ID-104",
    name: "Unregistered Entity",
    role: "Unknown",
    department: "External Caller",
    status: "Not Enrolled",
    sampleCount: 0,
    lastUpdated: "N/A",
    qualityScore: 0,
    phoneContact: "N/A",
  },
];

export async function fetchDashboardSummary() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard/summary`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fall back to rich mock data if endpoint is unpopulated
  }

  return {
    totalVerifications: 1284,
    highRiskDetections: 42,
    incidentsReported: 18,
    resolvedIncidents: 15,
    distribution: [
      { name: "Low Risk", count: 1140, fill: "#10b981" },
      { name: "Medium Risk", count: 102, fill: "#f59e0b" },
      { name: "High Risk", count: 30, fill: "#f97316" },
      { name: "Critical Risk", count: 12, fill: "#ef4444" },
    ],
  };
}

export async function fetchRecentActivity() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard/recent-activity`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fall back
  }

  return [
    {
      id: "ACT-1",
      event: "Critical impersonation attempt blocked for CFO identity.",
      time: "10 mins ago",
      type: "critical",
    },
    {
      id: "ACT-2",
      event: "Live voice verification session initialized by Security Agent.",
      time: "25 mins ago",
      type: "info",
    },
    {
      id: "ACT-3",
      event: "Voice profile updated for CEO Eleanor Vance.",
      time: "2 hours ago",
      type: "success",
    },
    {
      id: "ACT-4",
      event: "Secondary OTP verification succeeded for Incident INC-8744.",
      time: "4 hours ago",
      type: "success",
    },
  ];
}

export async function fetchIncidents(): Promise<Incident[]> {
  try {
    const res = await fetch(`${API_URL}/api/incidents`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  return mockIncidents;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<Incident> {
  try {
    const res = await fetch(`${API_URL}/api/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    // Local mock update
  }

  mockIncidents = mockIncidents.map((inc) =>
    inc.id === id ? { ...inc, status } : inc
  );
  return mockIncidents.find((inc) => inc.id === id)!;
}

export async function fetchEnrolledIdentities(): Promise<EnrolledIdentity[]> {
  try {
    const res = await fetch(`${API_URL}/api/enrollment/identities`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  return mockIdentities;
}

export async function addIncident(newIncident: Partial<Incident>): Promise<Incident> {
  const inc: Incident = {
    id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    sessionId: newIncident.sessionId || `SESH-${Math.floor(100 + Math.random() * 900)}`,
    claimedIdentity: newIncident.claimedIdentity || "Unknown",
    riskScore: newIncident.riskScore ?? 85,
    riskLevel: newIncident.riskLevel || "Critical",
    deepfakeProbability: newIncident.deepfakeProbability ?? 90,
    speakerScore: newIncident.speakerScore ?? 20,
    anomalyScore: newIncident.anomalyScore ?? 80,
    status: "Open",
    timestamp: new Date().toISOString(),
    durationSeconds: newIncident.durationSeconds || 60,
    summary: newIncident.summary || "Real-time threat reported during live call analysis.",
    recommendedAction: newIncident.recommendedAction || "Conduct secondary out-of-band verification.",
  };

  mockIncidents.unshift(inc);
  return inc;
}
