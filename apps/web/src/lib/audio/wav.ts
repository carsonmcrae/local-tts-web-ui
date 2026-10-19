/**
 * Purpose: Convert any browser-decodable audio into the 24 kHz mono 16-bit WAV the server accepts.
 * Scope: Mono down-mix, high-quality resampling via OfflineAudioContext (linear fallback for tests),
 *   trimming to a maximum length, and a dependency-free PCM16 WAV encoder. Decoding happens in the
 *   browser so the server only ever parses plain WAV.
 * Does NOT belong: Microphone capture (recorder.ts) or quality checks (analysis.ts).
 */

export const TARGET_RATE = 24_000;

/** Averages the channels, sized to the first; a shorter channel counts as silence past its end. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  return first.map(
    (_, i) => channels.reduce((sum, channel) => sum + (channel[i] ?? 0), 0) / channels.length,
  );
}

/** Linear-interpolation resampler, used when OfflineAudioContext is unavailable. */
export function resampleLinear(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  let written = 0;
  let previous = 0;
  // Walk the input once: every output position between two input samples is interpolated.
  samples.forEach((current, index) => {
    for (; written < out.length && written * ratio < index; written += 1) {
      out[written] = previous + (current - previous) * (written * ratio - (index - 1));
    }
    previous = current;
  });
  // Positions at or after the last input sample hold its value.
  out.fill(previous, written);
  return out;
}

async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (from === to) return samples;
  if (typeof OfflineAudioContext === 'undefined') return resampleLinear(samples, from, to);
  const length = Math.max(1, Math.ceil((samples.length * to) / from));
  const context = new OfflineAudioContext(1, length, to);
  const buffer = context.createBuffer(1, samples.length, from);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0).slice();
}

export interface DecodedClip {
  samples: Float32Array;
  sampleRate: number;
  trimmed: boolean;
}

/** Decode compressed or WAV audio and normalise it to mono 24 kHz, keeping at most `maxSeconds`. */
export async function decodeToClip(data: ArrayBuffer, maxSeconds: number): Promise<DecodedClip> {
  const AudioCtx =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  try {
    const buffer = await context.decodeAudioData(data.slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const mono = mixToMono(channels);
    const limit = Math.floor(maxSeconds * buffer.sampleRate);
    const trimmed = mono.length > limit;
    const samples = await resample(
      trimmed ? mono.subarray(0, limit) : mono,
      buffer.sampleRate,
      TARGET_RATE,
    );
    return { samples, sampleRate: TARGET_RATE, trimmed };
  } finally {
    void context.close();
  }
}

/** PCM16 mono WAV bytes. */
export function encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const ascii = new TextEncoder();
  const writeString = (offset: number, value: string) =>
    new Uint8Array(buffer, offset, value.length).set(ascii.encode(value));
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * bytesPerSample, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return buffer;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWavBuffer(samples, sampleRate)], { type: 'audio/wav' });
}
