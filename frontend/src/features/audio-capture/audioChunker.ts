/**
 * Audio processing and chunking helpers for VoiceShield.
 * Standardizes audio to 16,000 Hz Mono PCM Float32 or Int16
 * as required by deepfake detection neural models.
 */

export const TARGET_SAMPLE_RATE = 16000;

export function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Resamples an audio buffer to the target sample rate (16kHz)
 */
export function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number = TARGET_SAMPLE_RATE
): Float32Array {
  const sourceRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  
  // Extract mono channel (mix down if stereo)
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);
  
  if (numChannels === 1) {
    monoData.set(audioBuffer.getChannelData(0));
  } else {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      monoData[i] = (left[i] + right[i]) / 2;
    }
  }

  if (sourceRate === targetSampleRate) {
    return monoData;
  }

  // Linear interpolation resampling
  const ratio = sourceRate / targetSampleRate;
  const newLength = Math.round(length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const fraction = originalPos - index;

    if (index + 1 < length) {
      result[i] = monoData[index] * (1 - fraction) + monoData[index + 1] * fraction;
    } else {
      result[i] = monoData[index] || 0;
    }
  }

  return result;
}

/**
 * Slices a Float32Array PCM stream into chunks of chunkSeconds
 */
export function slicePcmChunks(
  pcmData: Float32Array,
  chunkSeconds: number = 0.5,
  sampleRate: number = TARGET_SAMPLE_RATE
): Float32Array[] {
  const chunkSize = Math.floor(chunkSeconds * sampleRate);
  const chunks: Float32Array[] = [];
  
  for (let i = 0; i < pcmData.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, pcmData.length);
    chunks.push(pcmData.slice(i, end));
  }
  
  return chunks;
}

/**
 * Computes Root Mean Square (RMS) volume level (0 to 1) for visualization
 */
export function computeRmsVolume(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  // Logarithmic scale amplification for visual dynamic range
  return Math.min(1, rms * 4.5);
}
