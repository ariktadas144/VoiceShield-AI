import React, { useState, useRef } from 'react';
import { EnrolledIdentity } from '../../types/enrollment';
import { useEnrollVoiceProfile } from './api';
import { useMicrophoneCapture } from '../audio-capture/useMicrophoneCapture';
import { X, Mic, Square, Upload, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react';
import { formatDuration } from '../../lib/formatters';

interface EnrollVoiceFormProps {
  identity: EnrolledIdentity | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EnrollVoiceForm: React.FC<EnrollVoiceFormProps> = ({
  identity,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const durationTimerRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);

  const enrollMutation = useEnrollVoiceProfile();

  const { isRecording, start: startMic, stop: stopMic, error: micError } = useMicrophoneCapture({
    onAudioChunk: (chunk) => {
      recordedChunksRef.current.push(chunk);
    },
    onVolumeChange: (vol) => {
      setVolumeLevel(vol);
    },
    chunkDurationMs: 250,
  });

  if (!isOpen || !identity) return null;

  const handleStartRecording = async () => {
    setRecordedBlob(null);
    setRecordedDuration(0);
    setSuccessMessage(null);
    recordedChunksRef.current = [];

    await startMic();

    durationTimerRef.current = window.setInterval(() => {
      setRecordedDuration((prev) => prev + 1);
    }, 1000);
  };

  const handleStopRecording = () => {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    stopMic();

    // Convert accumulated Float32Arrays into a WAV Blob
    const totalSamples = recordedChunksRef.current.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples > 0) {
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const piece of recordedChunksRef.current) {
        merged.set(piece, offset);
        offset += piece.length;
      }

      // Encode simple WAV header
      const wavBlob = createWavBlob(merged, 16000);
      setRecordedBlob(wavBlob);
    }
  };

  const createWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let index = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      index += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const handleSubmitEnrollment = async () => {
    const blobToSubmit = activeTab === 'record' ? recordedBlob : uploadFile;
    if (!blobToSubmit) return;

    try {
      await enrollMutation.mutateAsync({
        identityId: identity.id,
        audioBlob: blobToSubmit,
        durationSeconds: activeTab === 'record' ? recordedDuration : 15,
      });

      setSuccessMessage(`Voice biometric baseline successfully registered for ${identity.name}.`);
      setTimeout(() => {
        onClose();
        setSuccessMessage(null);
        setRecordedBlob(null);
        setUploadFile(null);
      }, 1800);
    } catch (err) {
      console.error('Enrollment failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Mic className="w-5 h-5 text-blue-400" />
              <span>Voice Biometric Enrollment</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Enrolling reference acoustic vectors for <span className="text-slate-200 font-semibold">{identity.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Method Tabs */}
          <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800">
            <button
              onClick={() => setActiveTab('record')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'record'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Record Live Microphone</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Audio Sample</span>
            </button>
          </div>

          {/* Record Mode */}
          {activeTab === 'record' && (
            <div className="space-y-4 text-center">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Phonetic Calibration Script:
                </span>
                <p className="text-xs font-medium text-slate-200 leading-relaxed italic bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                  "I am confirming my voice profile for VoiceShield security verification. This recording registers my authentic acoustic resonance for future automated identity verification."
                </p>
              </div>

              {/* Volume & Recording Visualizer */}
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="font-mono text-2xl font-black text-slate-100">
                  {formatDuration(recordedDuration)}
                </div>

                {isRecording && (
                  <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-75"
                      style={{ width: `${Math.min(100, volumeLevel * 100)}%` }}
                    />
                  </div>
                )}

                <div className="pt-2">
                  {!isRecording ? (
                    <button
                      onClick={handleStartRecording}
                      className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-950/50 cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Start Recording (min 5s)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopRecording}
                      className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-400 border border-red-500/40 font-bold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Stop & Review Sample</span>
                    </button>
                  )}
                </div>
              </div>

              {recordedBlob && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Sample captured ({recordedDuration}s, 16kHz PCM)</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-400">Ready to save</span>
                </div>
              )}
            </div>
          )}

          {/* Upload Mode */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl cursor-pointer bg-slate-900/40 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-xs font-bold text-slate-200">
                  {uploadFile ? uploadFile.name : 'Select reference .wav or .mp3 sample'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1">
                  Target clean speech with minimal background noise
                </span>
                <input
                  type="file"
                  accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>

              {uploadFile && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
                  <span className="font-medium truncate max-w-xs">{uploadFile.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {micError && (
            <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{micError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-900">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitEnrollment}
              disabled={(!recordedBlob && !uploadFile) || enrollMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-950/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {enrollMutation.isPending ? 'Computing Vector Embedding...' : 'Save Voice Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
