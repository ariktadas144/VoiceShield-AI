'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useLiveSessionStore } from '@/store/liveSessionStore';
import { useVoiceShieldSocket } from '@/features/realtime/useVoiceShieldSocket';
import { useMicrophoneCapture } from '@/features/audio-capture/useMicrophoneCapture';
import { useAudioUpload } from '@/features/audio-capture/useAudioUpload';
import { useCreateIncident } from '@/features/incidents/api';
import { useAlertSound } from '@/features/alerts/useAlertSound';
import { DEFAULT_IDENTITIES } from '@/lib/constants';
import { ClaimedIdentity, AudioSourceType } from '@/types/session';
import { formatDuration } from '@/lib/formatters';
import { getRecommendedActionText } from '@/features/risk-engine-ui/riskLevel';

// UI and Chart Components
import RiskGauge from '@/features/risk-engine-ui/RiskGauge';
import RiskBadge from '@/features/risk-engine-ui/RiskBadge';
import RiskTimeline from '@/features/risk-engine-ui/RiskTimeline';
import AnomalyDetectionChart from '@/features/risk-engine-ui/AnomalyDetectionChart';
import SubScoreBars from '@/features/risk-engine-ui/SubScoreBars';
import AlertBanner from '@/features/alerts/AlertBanner';
import CriticalAlertModal from '@/features/alerts/CriticalAlertModal';
import SecondaryVerificationModal from '@/features/alerts/SecondaryVerificationModal';

import {
  Mic,
  Upload,
  Radio,
  Square,
  Shield,
  ShieldAlert,
  PhoneCall,
  FileWarning,
  Clock,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

// Dynamic SSR-disabled import for AudioWaveform canvas
const DynamicAudioWaveform = dynamic(
  () => import('@/features/audio-capture/AudioWaveform'),
  { ssr: false }
);

export default function LiveVerificationPage() {
  const isAnalyzing = useLiveSessionStore((s) => s.isAnalyzing);
  const sessionId = useLiveSessionStore((s) => s.sessionId);
  const claimedIdentity = useLiveSessionStore((s) => s.claimedIdentity);
  const audioSource = useLiveSessionStore((s) => s.audioSource);
  const riskScore = useLiveSessionStore((s) => s.riskScore);
  const riskLevel = useLiveSessionStore((s) => s.riskLevel);
  const deepfakeProbability = useLiveSessionStore((s) => s.deepfakeProbability);
  const speakerScore = useLiveSessionStore((s) => s.speakerScore);
  const anomalyScore = useLiveSessionStore((s) => s.anomalyScore);
  const riskScoreHistory = useLiveSessionStore((s) => s.riskScoreHistory);
  const anomalyScoreHistory = useLiveSessionStore((s) => s.anomalyScoreHistory);
  const elapsedSeconds = useLiveSessionStore((s) => s.elapsedSeconds);
  const connectionStatus = useLiveSessionStore((s) => s.connectionStatus);

  const startSession = useLiveSessionStore((s) => s.startSession);
  const stopSession = useLiveSessionStore((s) => s.stopSession);
  const setClaimedIdentity = useLiveSessionStore((s) => s.setClaimedIdentity);
  const setAudioSource = useLiveSessionStore((s) => s.setAudioSource);

  // Modals & Alerts
  const [isSecondaryModalOpen, setIsSecondaryModalOpen] = useState(false);
  const [incidentLoggedSuccess, setIncidentLoggedSuccess] = useState(false);

  const { playAlertSound } = useAlertSound();
  const prevRiskLevelRef = useRef(riskLevel);

  // Audio Chunk Socket Stream
  const { sendAudioChunk } = useVoiceShieldSocket(isAnalyzing ? sessionId : null);
  const createIncidentMutation = useCreateIncident();

  // Trigger audio alert when risk flips to High or Critical
  useEffect(() => {
    if (isAnalyzing) {
      if (riskLevel === 'Critical' && prevRiskLevelRef.current !== 'Critical') {
        playAlertSound('critical');
      } else if (riskLevel === 'High' && prevRiskLevelRef.current !== 'High' && prevRiskLevelRef.current !== 'Critical') {
        playAlertSound('high');
      }
    }
    prevRiskLevelRef.current = riskLevel;
  }, [riskLevel, isAnalyzing, playAlertSound]);

  // Audio Chunk Callback
  const handleAudioChunk = useCallback(
    (base64Audio: string, seq: number) => {
      sendAudioChunk(base64Audio, seq, claimedIdentity?.name || 'Unknown', audioSource);
    },
    [sendAudioChunk, claimedIdentity, audioSource]
  );

  // Microphone Hook
  const mic = useMicrophoneCapture({
    onAudioChunk: handleAudioChunk,
  });

  // Upload Hook
  const upload = useAudioUpload({
    onAudioChunk: handleAudioChunk,
  });

  // Start Analysis Handler
  const handleStartAnalysis = async () => {
    startSession(audioSource, claimedIdentity);
    if (audioSource === 'mic') {
      await mic.start();
    } else {
      await upload.start();
    }
  };

  // Stop Analysis Handler
  const handleStopAnalysis = () => {
    if (audioSource === 'mic') {
      mic.stop();
    } else {
      upload.stop();
    }
    stopSession();
  };

  // Report Incident Handler
  const handleReportIncident = async () => {
    try {
      await createIncidentMutation.mutateAsync({
        sessionId,
        claimedIdentity: claimedIdentity?.name || 'Unknown',
        callerNumber: claimedIdentity?.phone || '+1 (555) 019-0000',
        riskScore,
        riskLevel,
        deepfakeProbability: deepfakeProbability / 100,
        speakerScore: speakerScore / 100,
        anomalyScore: anomalyScore / 100,
        status: 'OPEN',
        recommendedAction: riskLevel === 'Critical' ? 'BLOCK_AND_ESCALATE' : 'CHALLENGE_IDENTITY',
        actionTaken: 'Incident manually flagged by operator during live voice verification.',
        notes: `Flagged at ${formatDuration(elapsedSeconds)} mark with risk score ${riskScore}/100.`,
      });
      setIncidentLoggedSuccess(true);
      setTimeout(() => setIncidentLoggedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to log incident:', err);
    }
  };

  const actionRecommendation = getRecommendedActionText(riskLevel);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* High-Risk Persistent Alert Banner */}
      <AlertBanner
        onOpenSecondaryModal={() => setIsSecondaryModalOpen(true)}
        onReportIncident={handleReportIncident}
      />

      {/* Critical Threat Takeover Modal */}
      <CriticalAlertModal
        onOpenSecondaryVerification={() => setIsSecondaryModalOpen(true)}
        onReportIncident={handleReportIncident}
      />

      {/* Secondary Out-of-Band Verification Modal */}
      <SecondaryVerificationModal
        isOpen={isSecondaryModalOpen}
        onClose={() => setIsSecondaryModalOpen(false)}
        onSuccess={() => {
          setIncidentLoggedSuccess(true);
          setTimeout(() => setIncidentLoggedSuccess(false), 3000);
        }}
      />

      {/* Success Banner if Incident Logged */}
      {incidentLoggedSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 p-4 rounded-2xl flex items-center justify-between text-emerald-300 text-xs font-bold animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span>Incident successfully logged to Incident Repository &amp; SOC queue.</span>
          </div>
        </div>
      )}

      {/* Control Cockpit Header: Identity & Audio Source Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Audio Source Selector */}
          <div className="space-y-2 w-full lg:w-auto">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Audio Ingestion Feed
            </label>
            <div className="inline-flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => setAudioSource('mic')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  audioSource === 'mic'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                Live Microphone
              </button>

              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => setAudioSource('upload')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  audioSource === 'upload'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload Recording (3s Stream)
              </button>
            </div>
          </div>

          {/* Claimed Identity Selector */}
          <div className="space-y-2 w-full lg:w-auto">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Claimed Speaker Identity
            </label>
            <div className="flex items-center gap-2">
              <select
                disabled={isAnalyzing}
                value={claimedIdentity?.id || 'ceo'}
                onChange={(e) => {
                  const found = DEFAULT_IDENTITIES.find((id) => id.id === e.target.value);
                  if (found) setClaimedIdentity(found as ClaimedIdentity);
                }}
                className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium min-w-[220px]"
              >
                {DEFAULT_IDENTITIES.map((id) => (
                  <option key={id.id} value={id.id}>
                    {id.name} ({id.role}) {id.enrolled ? '• Enrolled' : '• Unregistered'}
                  </option>
                ))}
              </select>

              {claimedIdentity?.enrolled ? (
                <span className="hidden sm:inline-flex text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                  Voiceprint Ready
                </span>
              ) : (
                <span className="hidden sm:inline-flex text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                  No Voiceprint
                </span>
              )}
            </div>
          </div>

          {/* Start / Stop Primary Button */}
          <div className="w-full lg:w-auto flex items-center justify-end">
            {!isAnalyzing ? (
              <button
                type="button"
                onClick={handleStartAnalysis}
                className="w-full lg:w-auto px-8 py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm rounded-2xl shadow-xl shadow-indigo-950/60 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Radio className="w-5 h-5 animate-pulse text-cyan-200" />
                <span>Start Live Verification</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopAnalysis}
                className="w-full lg:w-auto px-8 py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-red-950/60 flex items-center justify-center gap-3 transition-all animate-pulse"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>Stop Analysis ({formatDuration(elapsedSeconds)})</span>
              </button>
            )}
          </div>
        </div>

        {/* Upload file selector if in Upload mode */}
        {audioSource === 'upload' && !isAnalyzing && (
          <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="audio-file-input"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    upload.selectFile(e.target.files[0]);
                  }
                }}
              />
              <label
                htmlFor="audio-file-input"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-2 border border-slate-700"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                {upload.selectedFile ? 'Change File' : 'Choose Audio File'}
              </label>
              <span className="text-xs text-slate-300 font-mono">
                {upload.selectedFile ? upload.selectedFile.name : 'No file selected (.wav, .mp3, .m4a)'}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              * Will simulate real-time 3-second packet delivery
            </span>
          </div>
        )}

        {/* Waveform Audio Visualizer */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest shrink-0">
              Audio Activity:
            </span>
            <div className="flex-1 sm:w-72">
              <DynamicAudioWaveform
                analyserNode={audioSource === 'mic' ? mic.analyserNode : upload.analyserNode}
                isActive={isAnalyzing}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cadence: <strong>3.0s heartbeat</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Status: <strong className="text-white uppercase">{connectionStatus}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Threat Evaluation Grid: Risk Gauge & Sub-Score Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Radial Risk Gauge & Severity Card */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between text-center">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Composite Risk Gauge
            </span>
            <RiskBadge level={riskLevel} size="sm" />
          </div>

          {/* SVG Gauge */}
          <div className="my-2">
            <RiskGauge score={riskScore} level={riskLevel} />
          </div>

          {/* Recommended Action Directive Panel */}
          <div className="w-full mt-4 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${actionRecommendation.badgeClass}`}>
                {actionRecommendation.title}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {actionRecommendation.description}
            </p>
          </div>

          {/* Real-time Operator Controls */}
          <div className="w-full grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => setIsSecondaryModalOpen(true)}
              className="py-2.5 px-3 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <PhoneCall className="w-4 h-4 text-indigo-400" />
              Verify Caller
            </button>
            <button
              onClick={handleReportIncident}
              className="py-2.5 px-3 bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <FileWarning className="w-4 h-4 text-red-400" />
              Report Incident
            </button>
          </div>
        </div>

        {/* Right: Sub-Score Telemetry Bars & Live Call Summary */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-6">
          <SubScoreBars
            deepfakeProbability={deepfakeProbability}
            speakerScore={speakerScore}
            anomalyScore={anomalyScore}
            isEnrolled={claimedIdentity?.enrolled}
          />

          {/* Telemetry Explanation & Identity Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h4 className="text-sm font-bold text-white">
                  Active Session Profile: {claimedIdentity?.name}
                </h4>
              </div>
              <span className="text-xs font-mono text-slate-400">{claimedIdentity?.role}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Session ID</span>
                <span className="font-mono text-xs font-bold text-slate-200 truncate block mt-0.5">
                  {sessionId}
                </span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Elapsed Time</span>
                <span className="font-mono text-xs font-bold text-cyan-400 block mt-0.5">
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Audio Packets</span>
                <span className="font-mono text-xs font-bold text-purple-400 block mt-0.5">
                  {riskScoreHistory.length} Chunks
                </span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Prevention</span>
                <span className="font-mono text-[11px] font-bold text-emerald-400 block mt-0.5 truncate">
                  ACTIVE
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              * VoiceShield AI continuously processes audio slices in 3-second segments. Inbound WebSocket telemetry dynamically streams risk score and acoustic anomalies to prevent caller spoofing in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* DUAL LIVE ROLLING WINDOW TIME-SERIES CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Live Risk Score Time Series */}
        <RiskTimeline
          data={riskScoreHistory}
          isLive={isAnalyzing}
        />

        {/* 2. Live Acoustic Anomaly Time Series */}
        <AnomalyDetectionChart
          data={anomalyScoreHistory}
          isLive={isAnalyzing}
        />
      </div>
    </div>
  );
}
