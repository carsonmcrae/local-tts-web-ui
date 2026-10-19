/**
 * Purpose: Instant, in-browser quality feedback for a voice recording.
 * Scope: Mirrors the server's checks (apps/server/src/ltts/voices/quality.py): speech duration,
 *   loudness, clipping, background noise (SNR estimate) and pause share, each producing a blocking
 *   error or an advisory warning. The server repeats these checks and has the final say.
 * Does NOT belong: Decoding (wav.ts) or UI.
 */

interface LocalIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface LocalReport {
  durationS: number;
  speechS: number;
  rmsDbfs: number;
  peakDbfs: number;
  clippingRatio: number;
  pauseRatio: number;
  snrDb: number;
  ok: boolean;
  issues: LocalIssue[];
}

const MIN_SPEECH_S = 6;
const RECOMMENDED_SPEECH_S = 10;
const SILENCE_DB = -45;
const FRAME_S = 0.03;

const toDb = (value: number) => Math.round(20 * Math.log10(Math.max(value, 1e-9)) * 10) / 10;

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return -120;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? -120;
}

function frameLevels(samples: Float32Array, frame: number): Float64Array {
  const count = Math.floor(samples.length / frame);
  const levels = new Float64Array(count);
  for (let f = 0; f < count; f += 1) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i += 1) sum += (samples[i] ?? 0) ** 2;
    levels[f] = 20 * Math.log10(Math.sqrt(sum / frame + 1e-12));
  }
  return levels;
}

type Rule = [metric: keyof LocalReport, below: boolean, threshold: number, issue: LocalIssue];

const RULES: Rule[] = [
  [
    'speechS',
    true,
    MIN_SPEECH_S,
    {
      code: 'too_short',
      severity: 'error',
      message: `There's too little speech. Record at least ${MIN_SPEECH_S} seconds of continuous reading.`,
    },
  ],
  [
    'speechS',
    true,
    RECOMMENDED_SPEECH_S,
    {
      code: 'short',
      severity: 'warning',
      message: 'This works, but 10–20 seconds of speech gives a more faithful voice.',
    },
  ],
  [
    'rmsDbfs',
    true,
    -40,
    {
      code: 'too_quiet',
      severity: 'error',
      message: 'The recording is very quiet. Move closer to the microphone and try again.',
    },
  ],
  [
    'rmsDbfs',
    true,
    -30,
    {
      code: 'quiet',
      severity: 'warning',
      message: 'The recording is a little quiet; speaking closer to the mic will help.',
    },
  ],
  [
    'clippingRatio',
    false,
    0.01,
    {
      code: 'clipping',
      severity: 'error',
      message: 'The audio is distorted (clipping). Lower the input volume or move back slightly.',
    },
  ],
  [
    'clippingRatio',
    false,
    0.001,
    {
      code: 'clipping',
      severity: 'warning',
      message: 'A few peaks clipped. It may still work; a quieter take is safer.',
    },
  ],
  [
    'snrDb',
    true,
    12,
    {
      code: 'noisy',
      severity: 'error',
      message: "There's a lot of background noise. Find a quieter room and try again.",
    },
  ],
  [
    'snrDb',
    true,
    20,
    {
      code: 'noisy',
      severity: 'warning',
      message: 'Some background noise is audible; a quieter room gives cleaner results.',
    },
  ],
  [
    'pauseRatio',
    false,
    0.5,
    {
      code: 'pauses',
      severity: 'warning',
      message: 'More than half the recording is silence. Read continuously at a natural pace.',
    },
  ],
];

export function analyzeSamples(samples: Float32Array, sampleRate: number): LocalReport {
  const frame = Math.max(1, Math.floor(sampleRate * FRAME_S));
  const levels = frameLevels(samples, frame);
  let speechFrames = 0;
  let speechEnergy = 0;
  levels.forEach((level, f) => {
    if (level <= SILENCE_DB) return;
    speechFrames += 1;
    for (let i = f * frame; i < (f + 1) * frame; i += 1) speechEnergy += (samples[i] ?? 0) ** 2;
  });
  let peak = 0;
  let clipped = 0;
  for (const value of samples) {
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= 0.99) clipped += 1;
  }
  const sorted = Float64Array.from(levels).sort();
  const report: Omit<LocalReport, 'ok' | 'issues'> = {
    durationS: Math.round((samples.length / sampleRate) * 100) / 100,
    speechS: Math.round(speechFrames * FRAME_S * 100) / 100,
    rmsDbfs: toDb(speechFrames ? Math.sqrt(speechEnergy / (speechFrames * frame)) : 0),
    peakDbfs: toDb(peak),
    clippingRatio: samples.length ? clipped / samples.length : 0,
    pauseRatio: levels.length ? 1 - speechFrames / levels.length : 1,
    snrDb: Math.round((percentile(sorted, 95) - percentile(sorted, 5)) * 10) / 10,
  };
  const issues: LocalIssue[] = [];
  const flagged = new Set<string>();
  for (const [metric, below, threshold, issue] of RULES) {
    const value = report[metric as keyof typeof report];
    const failed = below ? value < threshold : value > threshold;
    if (failed && !flagged.has(metric)) {
      flagged.add(metric);
      issues.push(issue);
    }
  }
  return { ...report, ok: !issues.some((issue) => issue.severity === 'error'), issues };
}
