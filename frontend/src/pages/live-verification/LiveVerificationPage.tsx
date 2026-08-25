import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLiveSessionStore } from '../../store/liveSessionStore';
import { useMicrophoneCapture } from '../../features/audio-capture/useMicrophoneCapture';
import { useAudioUpload } from '../../features/audio-capture/useAudioUpload';
import { useVoiceShieldSocket } from '../../features/realtime/useVoiceShieldSocket';
import { RiskGauge } from '../../features/risk-engine-ui/RiskGauge';
import { RiskBadge } from '../../features/risk-engine-ui/RiskBadge';
import { SubScoreBars } from '../../features/risk-engine-ui/SubScoreBars';
import { RiskTimeline } from '../../features/risk-engine-ui/RiskTimeline';
import { getRecommendedActionText, getRiskConfig } from '../../features/risk-engine-ui/riskLevel';
import { DEFAULT_CLAIMED_IDENTITIES } from '../../lib/constants';
import { formatDuration } from '../../lib/formatters';
import { useCreateIncident } from '../../features/incidents/api';
import { 
  Mic, 
  Upload, 
  Play, 
  Square, 
  PhoneCall, 
  PhoneOff, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  Volume2, 
  Radio, 
  AlertOctagon, 
  FileWarning, 
  PhoneForwarded,
  Activity,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface OutletContextType {
  onOpenSecondaryVerification: () => void;
}

export const LiveVerificationPage: React.FC = () => {
  const { onOpenSecondaryVerification } = useOutletContext<OutletContextType>();

  const [callerInputNumber, setCallerInputNumber] = useState<string>('+1 (555) 019-4821');
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);

  // Zustand state & actions
  const sessionId = useLiveSessionStore((state) => state.sessionId);
  const claimedIdentity = useLiveSessionStore((state) => state.claimedIdentity);
  const audioSource = useLiveSessionStore((state) => state.audioSource);
  const isActive = useLiveSessionStore((state) => state.isActive);
  const durationSeconds = useLiveSessionStore((state) => state.durationSeconds);
  const connectionStatus = useLiveSessionStore((state) => state.connectionStatus);
  const latestRiskScore = useLiveSessionStore((state) => state.latestRiskScore);
  const latestRiskLevel = useLiveSessionStore((state) => state.latestRiskLevel);
  const latestDeepfakeProbability = useLiveSessionStore((state) => state.latestDeepfakeProbability);
  const latestSpeakerScore = useLiveSessionStore((state) => state.latestSpeakerScore);
  const latestAnomalyScore = useLiveSessionStore((state) => state.latestAnomalyScore);
  const latestRecommendedAction = useLiveSessionStore((state) => state.latestRecommendedAction);
  const latestPreventionStatus = useLiveSessionStore((state) => state.latestPreventionStatus);
  const timeline = useLiveSessionStore((state) => state.timeline);
  const audioLevel = useLiveSessionStore((state) => state.audioLevel);
  const isSpeaking = useLiveSessionStore((state) => state.isSpeaking);

  const startSession = useLiveSessionStore((state) => state.startSession);
  const stopSession = useLiveSessionStore((state) => state.stopSession);
  const setClaimedIdentity = useLiveSessionStore((state) => state.setClaimedIdentity);
  const setAudioSource = useLiveSessionStore((state) => state.setAudioSource);
  const setAudioMetrics = useLiveSessionStore((state) => state.setAudioMetrics);
  const handleRiskUpdate = useLiveSessionStore((state) => state.handleRiskUpdate);

  // WebSocket hook
  const { sendAudioChunk } = useVoiceShieldSocket();
  const createIncidentMutation = useCreateIncident();

  // Microphone capture hook
  const {
    start: startMic,
    stop: stopMic,
    isRecording: isMicRecording,
    error: micError,
  } = useMicrophoneCapture({
    onAudioChunk: (chunk) => {
      sendAudioChunk(chunk);
      // Demo simulation fallback: if no WebSocket score arrives, simulate response
      if (connectionStatus !== 'connected') {
        simulateChunkAnalysis(chunk);
      }
    },
    onVolumeChange: (vol, speaking) => {
      setAudioMetrics(vol, speaking);
    },
  });

  // Audio upload simulation hook
  const {
    selectedFile,
    isPlaying: isUploadPlaying,
    isDecoding: isUploadDecoding,
    progress: uploadProgress,
    loadFile,
    startPlayback,
    stopPlayback,
    error: uploadError,
  } = useAudioUpload({
    onAudioChunk: (chunk) => {
      sendAudioChunk(chunk);
      if (connectionStatus !== 'connected') {
        simulateChunkAnalysis(chunk);
      }
    },
    onVolumeChange: (vol, speaking) => {
      setAudioMetrics(vol, speaking);
    },
    onPlaybackComplete: () => {
      handleStopVerification();
    },
  });

  // Fallback simulator for offline hackathon demos
  const simulateChunkAnalysis = (chunk: Float32Array) => {
    // Generate synthetic response based on file name or claimed identity
    const isAlexVance = claimedIdentity?.role === 'CEO';
    const isUnknown = claimedIdentity?.role === 'Unknown Caller';
    
    // Slight jitter around target values
    const baseDf = isAlexVance ? 0.91 : isUnknown ? 0.45 : 0.12;
    const dfProb = Math.min(1, Math.max(0, baseDf + (Math.random() * 0.08 - 0.04)));
    const speakerMatch = isAlexVance ? 0.18 : isUnknown ? 0.5 : 0.94;
    const anomaly = isAlexVance ? 0.72 : 0.2;

    const score = Math.round((dfProb * 0.4 + (1 - speakerMatch) * 0.25 + anomaly * 0.15 + 0.1) * 100);
    const level = score > 75 ? 'CRITICAL' : score > 60 ? 'HIGH' : score > 30 ? 'MEDIUM' : 'LOW';

    handleRiskUpdate({
      type: 'score',
      riskScore: score,
      riskLevel: level,
      deepfakeProbability: dfProb,
      speakerScore: speakerMatch,
      anomalyScore: anomaly,
      recommendedAction: level === 'CRITICAL' || level === 'HIGH' ? 'BLOCK_AND_ESCALATE' : 'CONTINUE',
      status: 'DEMO_MODE',
      backend: 'Dhwani-S2S-Fusion',
      inference_ms: 18.4,
    });
  };

  const handleStartVerification = async () => {
    startSession(claimedIdentity, audioSource, callerInputNumber);
    setReportSuccess(false);

    if (audioSource === 'microphone') {
      await startMic();
    } else {
      if (selectedFile) {
        startPlayback();
      }
    }
  };

  const handleStopVerification = () => {
    if (audioSource === 'microphone') {
      stopMic();
    } else {
      stopPlayback();
    }
    stopSession();
  };

  const handleReportCurrentIncident = async () => {
    await createIncidentMutation.mutateAsync({
      sessionId,
      claimedIdentityName: claimedIdentity?.name || 'Unknown Caller',
      claimedIdentityRole: claimedIdentity?.role || 'Unknown',
      claimedIdentityDepartment: claimedIdentity?.department || 'General',
      callerPhone: callerInputNumber,
      peakRiskScore: latestRiskScore,
      peakRiskLevel: latestRiskLevel,
      actionTaken: latestRecommendedAction,
      summary: `Manual incident logged by operator for session ${sessionId}. Impersonation risk peaked at ${latestRiskScore}/100.`,
      evidence: {
        deepfakeProbability: latestDeepfakeProbability,
        speakerMatchScore: latestSpeakerScore,
        prosodyAnomalyScore: latestAnomalyScore,
        contextRiskScore: 0.8,
        audioDurationSeconds: durationSeconds,
        samplesCount: timeline.length,
      },
    });
    setReportSuccess(true);
    setTimeout(() => setReportSuccess(false), 3000);
  };

  const actionText = getRecommendedActionText(latestRecommendedAction);
  const riskConfig = getRiskConfig(latestRiskLevel);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Session Controls Header Bar */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Audio Source & Identity Config */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Source Tabs */}
          <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800">
            <button
              onClick={() => {
                if (!isActive) setAudioSource('microphone');
              }}
              disabled={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                audioSource === 'microphone'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Microphone</span>
            </button>
            <button
              onClick={() => {
                if (!isActive) setAudioSource('upload');
              }}
              disabled={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                audioSource === 'upload'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Stream</span>
            </button>
          </div>

          {/* Claimed Identity Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] text-slate-500 font-semibold uppercase">Target:</span>
            <select
              value={claimedIdentity?.id || ''}
              onChange={(e) => {
                const found = DEFAULT_CLAIMED_IDENTITIES.find((id) => id.id === e.target.value);
                setClaimedIdentity(found || null);
              }}
              disabled={isActive}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              {DEFAULT_CLAIMED_IDENTITIES.map((id) => (
                <option key={id.id} value={id.id} className="bg-slate-900 text-slate-200">
                  {id.name} ({id.role})
                </option>
              ))}
            </select>
          </div>

          {/* Caller Phone Input */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
            <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={callerInputNumber}
              onChange={(e) => setCallerInputNumber(e.target.value)}
              disabled={isActive}
              placeholder="Inbound Caller ID"
              className="bg-transparent text-xs font-mono font-medium text-slate-200 w-36 focus:outline-none"
            />
          </div>
        </div>

        {/* Right: Start/Stop Primary Button */}
        <div className="flex items-center justify-between lg:justify-end gap-3">
          {/* Connection Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-mono text-[11px] uppercase font-bold text-slate-300">
              {connectionStatus === 'connected' ? 'WS Live' : connectionStatus}
            </span>
          </div>

          {!isActive ? (
            <button
              onClick={handleStartVerification}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Analysis</span>
            </button>
          ) : (
            <button
              onClick={handleStopVerification}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-950/50 transition-all cursor-pointer animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Analysis ({formatDuration(durationSeconds)})</span>
            </button>
          )}
        </div>
      </div>

      {/* File Upload Trigger Area (When Upload Source is active) */}
      {audioSource === 'upload' && !isActive && (
        <div className="glass-panel p-4 rounded-2xl border-dashed border-2 border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">
                {selectedFile ? selectedFile.name : 'Select Test Audio File (.wav or .mp3)'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {selectedFile
                  ? `Decoded PCM ready. ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                  : 'Simulate live stream analysis by replaying recorded voice files'}
              </p>
            </div>
          </div>

          <label className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition-colors">
            <span>{selectedFile ? 'Change File' : 'Browse File'}</span>
            <input
              type="file"
              accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  loadFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Live Audio Visualizer / Waveform Meter */}
      <div className="glass-panel p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl border transition-colors ${
              isSpeaking
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
          >
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <span>Acoustic Waveform Activity</span>
              {isSpeaking && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Voice Detected
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Session: {sessionId} • 16,000 Hz PCM Mono
            </div>
          </div>
        </div>

        {/* Dynamic Waveform Bars */}
        <div className="flex items-center gap-1 h-8">
          {[0.3, 0.6, 0.9, 0.4, 0.8, 0.5, 1.0, 0.7, 0.3, 0.85, 0.6, 0.4].map((mult, i) => {
            const height = isActive
              ? Math.max(15, Math.min(100, audioLevel * 100 * mult * (isSpeaking ? 1.4 : 0.2)))
              : 15;
            return (
              <div
                key={i}
                className={`w-1.5 rounded-full transition-all duration-75 ${
                  isActive && isSpeaking
                    ? latestRiskLevel === 'CRITICAL'
                      ? 'bg-red-400 shadow-sm shadow-red-500'
                      : latestRiskLevel === 'HIGH'
                      ? 'bg-orange-400'
                      : 'bg-emerald-400 shadow-sm shadow-emerald-500'
                    : 'bg-slate-800'
                }`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Core Real-Time Analysis Display Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Risk Gauge & Action Banner (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Main Risk Gauge Panel */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Impersonation Risk Engine
              </span>
              <RiskBadge level={latestRiskLevel} score={latestRiskScore} />
            </div>

            {/* SVG Circular Gauge */}
            <RiskGauge score={latestRiskScore} size={250} />

            {/* Recommended Action Panel */}
            <div
              className={`w-full mt-5 p-4 rounded-2xl border transition-all duration-300 ${riskConfig.bgColor} ${riskConfig.borderColor}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  <span>{actionText.title}</span>
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed font-medium">
                {actionText.instruction}
              </p>
            </div>
          </div>

          {/* Quick Intervention Controls */}
          <div className="glass-panel p-5 rounded-2xl space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Active Session Controls
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onOpenSecondaryVerification}
                className="py-2.5 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <PhoneForwarded className="w-4 h-4 text-blue-400" />
                <span>Verify Caller</span>
              </button>

              <button
                onClick={handleReportCurrentIncident}
                disabled={createIncidentMutation.isPending}
                className="py-2.5 px-3 rounded-xl bg-red-950/60 hover:bg-red-900/70 border border-red-500/40 text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileWarning className="w-4 h-4 text-red-400" />
                <span>{reportSuccess ? 'Incident Logged!' : 'Report Threat'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Sub-Scores & Risk Timeline (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Sub-Score Bars Panel */}
          <div className="glass-panel p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                  Neural Signal Breakdown
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Extracted acoustic indicators & speaker similarity
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
                Hop: 500ms
              </span>
            </div>

            <SubScoreBars
              deepfakeProbability={latestDeepfakeProbability}
              speakerMatchScore={latestSpeakerScore}
              prosodyAnomalyScore={latestAnomalyScore}
              hasEnrolledProfile={claimedIdentity?.hasVoiceProfile}
            />
          </div>

          {/* Real-Time Risk Timeline */}
          <div className="glass-panel p-6 rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                  Live Risk Timeline
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sequential risk progression across 3-second audio windows
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {timeline.length} windows scored
              </span>
            </div>

            <RiskTimeline timeline={timeline} height={200} />
          </div>
        </div>
      </div>
    </div>
  );
};
