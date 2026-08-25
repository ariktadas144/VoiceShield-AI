import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { AlertBanner } from '../../features/alerts/AlertBanner';
import { CriticalAlertModal } from '../../features/alerts/CriticalAlertModal';
import { SecondaryVerificationModal } from '../../pages/secondary-verification/SecondaryVerificationModal';
import { useLiveSessionStore } from '../../store/liveSessionStore';
import { useAlertSound } from '../../features/alerts/useAlertSound';
import { useCreateIncident } from '../../features/incidents/api';

export const AppShell: React.FC = () => {
  const [isSecondaryModalOpen, setIsSecondaryModalOpen] = useState<boolean>(false);
  
  const activeAlert = useLiveSessionStore((state) => state.activeAlert);
  const dismissAlert = useLiveSessionStore((state) => state.dismissAlert);
  const latestRiskScore = useLiveSessionStore((state) => state.latestRiskScore);
  const latestRiskLevel = useLiveSessionStore((state) => state.latestRiskLevel);
  const latestDeepfakeProbability = useLiveSessionStore((state) => state.latestDeepfakeProbability);
  const claimedIdentity = useLiveSessionStore((state) => state.claimedIdentity);
  const callerNumber = useLiveSessionStore((state) => state.callerNumber);
  const tickDuration = useLiveSessionStore((state) => state.tickDuration);
  const isActive = useLiveSessionStore((state) => state.isActive);
  const sessionId = useLiveSessionStore((state) => state.sessionId);

  const { playAlertChime } = useAlertSound();
  const createIncidentMutation = useCreateIncident();

  // Call duration interval timer
  useEffect(() => {
    let interval: number | null = null;
    if (isActive) {
      interval = window.setInterval(() => {
        tickDuration();
      }, 1000);
    }
    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [isActive, tickDuration]);

  // Alert audio chime trigger
  useEffect(() => {
    if (latestRiskLevel === 'HIGH' || latestRiskLevel === 'CRITICAL') {
      playAlertChime(latestRiskLevel);
    }
  }, [latestRiskLevel, playAlertChime]);

  const handleReportIncident = async () => {
    await createIncidentMutation.mutateAsync({
      sessionId,
      claimedIdentityName: claimedIdentity?.name || 'Unknown Caller',
      claimedIdentityRole: claimedIdentity?.role || 'Unknown',
      claimedIdentityDepartment: claimedIdentity?.department || 'General',
      callerPhone: callerNumber,
      peakRiskScore: latestRiskScore,
      peakRiskLevel: latestRiskLevel,
      actionTaken: 'BLOCK_AND_ESCALATE',
      summary: `Automated incident filed during live call. Synthetic deepfake probability was ${Math.round(latestDeepfakeProbability * 100)}%. Risk score: ${latestRiskScore}/100.`,
      evidence: {
        deepfakeProbability: latestDeepfakeProbability,
        speakerMatchScore: 0.15,
        prosodyAnomalyScore: 0.75,
        contextRiskScore: 0.85,
        audioDurationSeconds: 20,
        samplesCount: 6,
      },
    });
    dismissAlert();
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col">
      {/* Top High/Critical Alert Banner */}
      {activeAlert && activeAlert.severity === 'HIGH' && (
        <AlertBanner
          level={activeAlert.severity}
          title={activeAlert.title}
          message={activeAlert.message}
          onDismiss={dismissAlert}
          onVerifyCaller={() => setIsSecondaryModalOpen(true)}
        />
      )}

      {/* Main Layout Body */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <Outlet context={{ onOpenSecondaryVerification: () => setIsSecondaryModalOpen(true) }} />
            </div>
          </main>
        </div>
      </div>

      {/* Critical Alert Overlay Modal */}
      <CriticalAlertModal
        isOpen={!!activeAlert && activeAlert.severity === 'CRITICAL'}
        score={latestRiskScore}
        deepfakeProbability={latestDeepfakeProbability}
        claimedIdentity={claimedIdentity}
        onClose={dismissAlert}
        onOpenSecondaryVerification={() => setIsSecondaryModalOpen(true)}
        onReportIncident={handleReportIncident}
      />

      {/* Secondary Verification Modal */}
      <SecondaryVerificationModal
        isOpen={isSecondaryModalOpen}
        claimedIdentity={claimedIdentity}
        callerNumber={callerNumber}
        onClose={() => setIsSecondaryModalOpen(false)}
      />
    </div>
  );
};
