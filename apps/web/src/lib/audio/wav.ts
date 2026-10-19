/**
 * Purpose: Convert any browser-decodable audio into the 24 kHz mono 16-bit WAV the server accepts.
 * Scope: Mono down-mix, high-quality resampling via OfflineAudioContext (linear fallback for tests),
 *   trimming to a maximum length, and a dependency-free PCM16 WAV encoder. Decoding happens in the
 *   browser so the server only ever parses plain WAV.
 * Does NOT belong: Microphone capture (recorder.ts) or quality checks (analysis.ts).
 */

export const TARGET_RATE = 24_000;

export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i += 1)
      mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / channels.length;
  }
  return mono;
}

export function resampleLinear(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = samples[index] ?? 0;
    const b = samples[index + 1] ?? a;
    out[i] = a + (b - a) * fraction;
  }
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
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
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
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * bytesPerSample, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
