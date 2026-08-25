"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Mic,
  Upload,
  Play,
  Square,
  ShieldCheck,
  AlertTriangle,
  Radio,
  UserCheck,
  Activity,
  FileCheck,
} from "lucide-react";
import { useLiveSessionStore } from "@/store/liveSessionStore";
import { useVoiceShieldSocket } from "@/features/realtime/useVoiceShieldSocket";
import { useMicrophoneCapture } from "@/features/audio-capture/useMicrophoneCapture";
import { useAudioUpload } from "@/features/audio-capture/useAudioUpload";
import { ClaimedIdentity, AudioSourceType } from "@/types/session";
import RiskGauge from "@/features/risk-engine-ui/RiskGauge";
import RiskBadge from "@/features/risk-engine-ui/RiskBadge";
import SubScoreBars from "@/features/risk-engine-ui/SubScoreBars";
import RiskTimeline from "@/features/risk-engine-ui/RiskTimeline";
import AnomalyDetectionChart from "@/features/risk-engine-ui/AnomalyDetectionChart";
import AudioWaveformVisualizer from "@/features/risk-engine-ui/AudioWaveformVisualizer";
import CriticalAlertModal from "@/features/alerts/CriticalAlertModal";
import AlertBanner from "@/features/alerts/AlertBanner";
import { SecondaryVerificationModal } from "@/components/SecondaryVerificationModal";
import { addIncident } from "@/lib/apiClient";
import { toast } from "sonner";

export default function LiveVerificationPage() {
  const [sourceType, setSourceType] = useState<AudioSourceType>("mic");
  const [identity, setIdentity] = useState<ClaimedIdentity>("CFO");

  const {
    sessionId,
    connectionStatus,
    isStreaming,
    latestRiskEvent,
    startSession,
    stopSession,
    setSecondaryVerificationModalOpen,
    isSecondaryVerificationModalOpen,
  } = useLiveSessionStore();

  const { sendAudioChunk } = useVoiceShieldSocket();

  // Microphone capture callback
  const { isRecording, audioLevel, startRecording, stopRecording } = useMicrophoneCapture({
    onChunkAvailable: (base64Audio, seq) => {
      sendAudioChunk(seq, base64Audio, identity);
    },
    onError: (err) => toast.error(err),
  });

  // File upload capture callback
  const { isUploading, progress, startUpload, stopUpload, setSelectedFile, selectedFile } =
    useAudioUpload({
      onChunkAvailable: (base64Audio, seq) => {
        sendAudioChunk(seq, base64Audio, identity);
      },
      onComplete: () => {
        toast.success("Audio file simulation playback completed.");
        handleStop();
      },
      onError: (err) => toast.error(err),
    });

  const handleStart = async () => {
    const newSeshId = startSession(sourceType, identity);
    toast.info(`Session initialized (${newSeshId}). Verification running on 3s cadence.`);

    if (sourceType === "mic") {
      await startRecording();
    } else if (sourceType === "upload" && selectedFile) {
      await startUpload(selectedFile);
    } else {
      toast.error("Please select an audio file first.");
      stopSession();
    }
  };

  const handleStop = () => {
    if (sourceType === "mic") {
      stopRecording();
    } else {
      stopUpload();
    }
    stopSession();
    toast.success("Live verification session ended. Timeline charts frozen.");
  };

  const handleReportIncident = async () => {
    if (!latestRiskEvent) return;
    try {
      await addIncident({
        sessionId: latestRiskEvent.sessionId,
        claimedIdentity: identity,
        riskScore: latestRiskEvent.riskScore,
        riskLevel: latestRiskEvent.riskLevel,
        deepfakeProbability: latestRiskEvent.deepfakeProbability,
        speakerScore: latestRiskEvent.speakerScore,
        anomalyScore: latestRiskEvent.anomalyScore,
        summary: `Incident reported manually by Security Officer during ${identity} verification call.`,
      });
      toast.success("Incident reported & logged to Incident History registry.");
    } catch (e) {
      toast.error("Failed to report incident.");
    }
  };

  const currentRiskScore = latestRiskEvent?.riskScore ?? 10;
  const currentRiskLevel = latestRiskEvent?.riskLevel ?? "Low";
  const recommendedAction =
    latestRiskEvent?.recommendedAction ?? "Call identity claimed. Awaiting stream initialization...";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner for High/Critical Alerts */}
      <AlertBanner />

      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Live Voice Verification
            </h1>
            {isStreaming && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded animate-pulse">
                <Radio className="w-3 h-3 text-emerald-400" />
                3s Heartbeat
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time neural stream inspecting synthetic voice artifacts and acoustic anomalies over 3-second chunks.
          </p>
        </div>

        {/* Connection Status Badge */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-xl font-mono text-xs">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connectionStatus === "live"
                ? "bg-emerald-400 animate-ping"
                : connectionStatus === "connecting"
                ? "bg-amber-400 animate-bounce"
                : "bg-slate-600"
            }`}
          ></span>
          <span className="text-slate-300 font-semibold uppercase">{connectionStatus}</span>
          {sessionId && <span className="text-cyan-400 font-bold ml-1">({sessionId})</span>}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Controls, Visualizer & Live Time-Series Graphs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Controls Panel */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Audio Source Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase font-mono">
                  Audio Input Source
                </label>
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setSourceType("mic")}
                    disabled={isStreaming}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                      sourceType === "mic"
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Microphone</span>
                  </button>
                  <button
                    onClick={() => setSourceType("upload")}
                    disabled={isStreaming}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                      sourceType === "upload"
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>File Upload</span>
                  </button>
                </div>
              </div>

              {/* Claimed Identity Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase font-mono">
                  Claimed Identity Profile
                </label>
                <select
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value as ClaimedIdentity)}
                  disabled={isStreaming}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="CEO">Eleanor Vance (CEO)</option>
                  <option value="CFO">Marcus Holloway (CFO)</option>
                  <option value="Manager">Sarah Jenkins (Manager)</option>
                  <option value="Unknown">Unregistered External Caller</option>
                </select>
              </div>
            </div>

            {/* File Upload Selector (when upload mode active) */}
            {sourceType === "upload" && !isStreaming && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                  className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
                />
                {selectedFile && (
                  <span className="text-[11px] font-mono text-cyan-400 truncate max-w-[200px]">
                    {selectedFile.name}
                  </span>
                )}
              </div>
            )}

            {/* Audio Waveform Activity Visualizer */}
            <AudioWaveformVisualizer audioLevel={audioLevel} />

            {/* Start / Stop CTA Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              {!isStreaming ? (
                <button
                  onClick={handleStart}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 transition-all transform active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Live Verification</span>
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-lg shadow-rose-950/50 transition-all transform active:scale-95 animate-pulse"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Analysis & Freeze Charts</span>
                </button>
              )}
            </div>
          </div>

          {/* REAL-TIME TIME-SERIES GRAPHS (STACKED FOR POINT-TO-POINT COMPARISON) */}
          <div className="space-y-4">
            <RiskTimeline />
            <AnomalyDetectionChart />
          </div>
        </div>

        {/* Right Column (1 Col): Risk Gauge, Sub-score Bars, & Recommended Actions */}
        <div className="space-y-6">
          {/* Main Risk Gauge Card */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-2">
            <div className="flex items-center justify-between w-full border-b border-slate-800/80 pb-3 mb-2">
              <span className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
                Current Risk Gauge
              </span>
              <RiskBadge level={currentRiskLevel} />
            </div>

            <RiskGauge score={currentRiskScore} />
          </div>

          {/* Sub-score Bars Breakdown */}
          <SubScoreBars />

          {/* Recommended Action Panel */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Recommended Security Action</span>
            </h3>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <p className="text-xs text-slate-200 leading-relaxed font-sans">{recommendedAction}</p>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setSecondaryVerificationModalOpen(true)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verify Caller</span>
              </button>

              <button
                onClick={handleReportIncident}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Report Incident</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Alert Emergency Overlay Modal */}
      <CriticalAlertModal />

      {/* Secondary Verification Modal */}
      {isSecondaryVerificationModalOpen && (
        <SecondaryVerificationModal onClose={() => setSecondaryVerificationModalOpen(false)} />
      )}
    </div>
  );
}
