// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Watch and measure the background music the app plays in a real browser, for music.spec.ts.
 * Scope: Page-side functions, injected before the app loads. They record every music source the app
 *   starts (its decoded buffer, start time, offset and duration, its join gain's automation and the
 *   track fade it feeds), can finish the oldest chunk of a track early so the app schedules the next,
 *   and measure each join between two chunks as the app scheduled them: the output rebuilt frame by
 *   frame from those sources and gains, the step at the join and at the start of its crossfade
 *   against a large normal step (the 99.9th percentile) in the music, how far apart the two chunks'
 *   copies of the same music are, and the same measures for a join broken on purpose (cut without a
 *   crossfade, or one chunk 24 frames off), to show that they would catch one.
 * Does NOT belong: The music itself (apps/web/src/features/music) or assertions (music.spec.ts).
 */
import type { Page } from '@playwright/test';

interface GainEvent {
  type: 'set' | 'ramp';
  value: number;
  time: number;
}

interface Played {
  voice: number;
  node: AudioBufferSourceNode;
  buffer: AudioBuffer | null;
  when: number;
  offset: number;
  duration: number;
  gain: GainEvent[];
  ended: boolean;
}

interface Probe {
  played: Played[];
  started: number;
  ended: number;
  gains: WeakMap<AudioNode, GainEvent[]>;
  fades: WeakMap<AudioNode, AudioNode>;
  voices: Map<AudioNode, number>;
}

/** A join as measured: where it is, how big a step it makes, and its controls. */
export interface JoinMeasure {
  at: number;
  /** Seconds between where the next chunk's music starts and where the last one's ended. */
  drift: number;
  /** The larger step at the join or at its crossfade's start, against a large normal step. */
  seam: number;
  /** The same step had the chunks been cut together without a crossfade. */
  cut: number;
  /** The shift (in frames) at which the two copies of the music match best; 0 is aligned. */
  lag: number;
  /** The same with the next chunk read 24 frames late. */
  shifted: number;
  /** Frames the decoder gave beyond (positive) or short of (negative) the chunk's own. */
  decoded: number;
}

const JOIN_WINDOW = 0.028;

function probeState(): Probe {
  return (globalThis as unknown as { musicProbe: Probe }).musicProbe;
}

function probeVoice(fade: AudioNode | undefined): number {
  const probe = probeState();
  if (!fade) return -1;
  if (!probe.voices.has(fade)) probe.voices.set(fade, probe.voices.size);
  return probe.voices.get(fade) ?? -1;
}

function probeWatchGain(gain: GainNode): void {
  const probe = probeState();
  const events: GainEvent[] = [];
  probe.gains.set(gain, events);
  const set = gain.gain.setValueAtTime.bind(gain.gain);
  const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
  gain.gain.setValueAtTime = (value, time) => {
    events.push({ type: 'set', value, time });
    return set(value, time);
  };
  gain.gain.linearRampToValueAtTime = (value, time) => {
    events.push({ type: 'ramp', value, time });
    return ramp(value, time);
  };
  const connect = gain.connect.bind(gain) as (node: AudioNode) => AudioNode;
  gain.connect = ((node: AudioNode) => {
    probe.fades.set(gain, node);
    return connect(node);
  }) as GainNode['connect'];
}

function probeWatchSource(source: AudioBufferSourceNode): void {
  const probe = probeState();
  let join: AudioNode | undefined;
  const connect = source.connect.bind(source) as (node: AudioNode) => AudioNode;
  source.connect = ((node: AudioNode) => {
    join = node;
    return connect(node);
  }) as AudioBufferSourceNode['connect'];
  const start = source.start.bind(source);
  source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
    const [when = 0, offset = 0, duration = Number.NaN] = args;
    const played: Played = {
      voice: probeVoice(join ? probe.fades.get(join) : undefined),
      node: source,
      buffer: source.buffer,
      when,
      offset,
      duration,
      gain: (join && probe.gains.get(join)) ?? [],
      ended: false,
    };
    probe.played.push(played);
    probe.started += 1;
    source.addEventListener('ended', () => {
      if (played.ended) return;
      played.ended = true;
      probe.ended += 1;
    });
    start(...args);
  };
}

function probeInstall(): void {
  (globalThis as unknown as { musicProbe: Probe }).musicProbe = {
    played: [],
    started: 0,
    ended: 0,
    gains: new WeakMap(),
    fades: new WeakMap(),
    voices: new Map(),
  };
  const Original = globalThis.AudioContext;
  globalThis.AudioContext = class extends Original {
    override createGain() {
      const gain = super.createGain();
      probeWatchGain(gain);
      return gain;
    }
    override createBufferSource() {
      const source = super.createBufferSource();
      probeWatchSource(source);
      return source;
    }
  };
}

/** Sources started and tracks heard (chunks grouped by the track fade they feed). */
function probeCounts(): {
  started: number;
  playing: number;
  tracks: number;
  tracksStarted: number;
} {
  const probe = probeState();
  const heard = probe.played.filter((played) => !played.ended);
  return {
    started: probe.started,
    playing: probe.started - probe.ended,
    tracks: new Set(heard.map((played) => played.voice)).size,
    tracksStarted: new Set(probe.played.map((played) => played.voice)).size,
  };
}

/** The newest track and how many of its chunks have started. */
function probeNewest(): { voice: number; chunks: number } {
  const probe = probeState();
  const voice = probe.played.at(-1)?.voice ?? -1;
  return { voice, chunks: probe.played.filter((played) => played.voice === voice).length };
}

/** End `voice`'s oldest chunk now, as if it had played out, so the app schedules the one after. */
function probeFinishOldest(voice: number): void {
  const oldest = probeState().played.find((played) => played.voice === voice && !played.ended);
  oldest?.node.dispatchEvent(new Event('ended'));
  // Stopped too, as if it had played: a source still scheduled keeps its buffer in memory.
  oldest?.node.stop();
}

function probeGainAt(events: GainEvent[], time: number): number {
  let value = 1;
  let since = 0;
  for (const event of events) {
    if (event.time <= time) {
      value = event.value;
      since = event.time;
    } else if (event.type === 'ramp') {
      return value + ((event.value - value) * (time - since)) / (event.time - since);
    } else {
      return value;
    }
  }
  return value;
}

/** The frame of `played`'s buffer heard at context frame `frame` (outside what it plays, too). */
function probeIndex(played: Played, frame: number, rate: number): number {
  return Math.round((frame / rate - played.when + played.offset) * rate);
}

/** What `played` adds at context frame `frame`: its sample there times its gain, while it plays. */
function probeHeard(played: Played, channel: number, frame: number, rate: number): number {
  const time = frame / rate;
  if (time < played.when || time >= played.when + played.duration) return 0;
  const sample = played.buffer?.getChannelData(channel)[probeIndex(played, frame, rate)] ?? 0;
  return sample * probeGainAt(played.gain, time);
}

/** A large normal step in what `played` plays: the 99.9th percentile of the steps, every 7th. */
function probeTypical(played: Played, channel: number, rate: number): number {
  const samples = played.buffer?.getChannelData(channel) ?? new Float32Array();
  const first = Math.round(played.offset * rate);
  const last = Math.min(first + Math.round(played.duration * rate), samples.length);
  const steps: number[] = [];
  for (let i = first + 1; i < last; i += 7)
    steps.push(Math.abs(Number(samples[i]) - Number(samples[i - 1])));
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length * 0.999)] ?? 1;
}

/** Both chunks' raw samples (no gain) at `frame`: the one ending, and the next read `shift` late. */
function probeRaw(played: Played, channel: number, frame: number, rate: number): number {
  return played.buffer?.getChannelData(channel)[probeIndex(played, frame, rate)] ?? 0;
}

/** A 16-frame moving average: what Opus codes as waveform, not the noise it fills high bands with. */
function probeLow(values: number[]): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - 15);
    const span = values.slice(from, i + 1);
    return span.reduce((sum, value) => sum + value, 0) / span.length;
  });
}

function probeCorrelation(a: number[], b: number[]): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (const [i, value] of a.entries()) {
    const other = Number(b[i]);
    dot += value * other;
    aa += value * value;
    bb += other * other;
  }
  return dot / Math.sqrt(aa * bb + 1e-20);
}

/** The shift (frames) at which the next chunk's copy of the music best matches the last one's. */
function probeLag(
  before: Played,
  after: Played,
  from: number,
  rate: number,
  shift: number,
): number {
  const frames = Math.round(JOIN_WINDOW * rate);
  const ending = probeLow(
    Array.from({ length: frames }, (_, i) => probeRaw(before, 0, from + i, rate)),
  );
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -32; lag <= 32; lag += 1) {
    const next = probeLow(
      Array.from({ length: frames }, (_, i) => probeRaw(after, 0, from + i + lag + shift, rate)),
    );
    const score = probeCorrelation(ending, next);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

/** The output step at `frame` (both chunks with their gains), against a large normal step. */
function probeStep(pair: Played[], channel: number, frame: number, rate: number): number {
  const out = (at: number) =>
    pair.reduce((sum, played) => sum + probeHeard(played, channel, at, rate), 0);
  return Math.abs(out(frame) - out(frame - 1));
}

/**
 * Measure the join between `voice`'s chunk `index` and the one after it, then let the earlier one's
 * buffer go. `frames` is the next chunk's music in frames, from library.json.
 */
function probeJoin(voice: number, index: number, frames: number): JoinMeasure {
  const chunks = probeState().played.filter((played) => played.voice === voice);
  const before = chunks[index] as Played;
  const after = chunks[index + 1] as Played;
  const rate = after.buffer?.sampleRate ?? 48_000;
  const at = before.when + before.duration;
  const join = Math.round(at * rate);
  const fadeStart = Math.round(after.when * rate);
  let seam = 0;
  let cut = 0;
  for (let channel = 0; channel < (after.buffer?.numberOfChannels ?? 0); channel += 1) {
    const typical = probeTypical(before, channel, rate);
    const steps = [join, fadeStart].map((frame) =>
      probeStep([before, after], channel, frame, rate),
    );
    seam = Math.max(seam, ...steps.map((step) => step / typical));
    const hard = probeRaw(after, channel, join, rate) - probeRaw(before, channel, join - 1, rate);
    cut = Math.max(cut, Math.abs(hard) / typical);
  }
  const measure: JoinMeasure = {
    at,
    drift: after.when + after.duration - frames / rate - at,
    seam,
    cut,
    lag: probeLag(before, after, fadeStart, rate, 0),
    shifted: probeLag(before, after, fadeStart, rate, 24),
    decoded: (after.buffer?.length ?? 0) - frames - 2 * 960,
  };
  before.buffer = null;
  return measure;
}

const PAGE_FUNCTIONS = [
  probeState,
  probeVoice,
  probeWatchGain,
  probeWatchSource,
  probeInstall,
  probeCounts,
  probeNewest,
  probeFinishOldest,
  probeGainAt,
  probeIndex,
  probeHeard,
  probeTypical,
  probeRaw,
  probeLow,
  probeCorrelation,
  probeLag,
  probeStep,
  probeJoin,
];

/** Put the probe in the page before the app loads, and read and drive it from the test. */
export async function watchMusic(page: Page) {
  const source = [
    `const JOIN_WINDOW = ${JOIN_WINDOW};`,
    ...PAGE_FUNCTIONS.map(String),
    // Init scripts run wrapped in a function: publish the ones the test calls.
    `Object.assign(globalThis, { ${PAGE_FUNCTIONS.map((fn) => fn.name).join(', ')} });`,
    'probeInstall();',
  ].join('\n');
  await page.addInitScript(source);
  const call = <T>(name: string, ...args: number[]) =>
    page.evaluate(
      ([fn, values]) =>
        (globalThis as unknown as Record<string, (...input: number[]) => unknown>)[fn]?.(...values),
      [name, args] as const,
    ) as Promise<T>;
  return {
    started: async () => (await call<ReturnType<typeof probeCounts>>('probeCounts')).started,
    playing: async () => (await call<ReturnType<typeof probeCounts>>('probeCounts')).playing,
    tracks: async () => (await call<ReturnType<typeof probeCounts>>('probeCounts')).tracks,
    tracksStarted: async () =>
      (await call<ReturnType<typeof probeCounts>>('probeCounts')).tracksStarted,
    newest: () => call<ReturnType<typeof probeNewest>>('probeNewest'),
    finishOldest: (voice: number) => call<void>('probeFinishOldest', voice),
    join: (voice: number, index: number, frames: number) =>
      call<JoinMeasure>('probeJoin', voice, index, frames),
  };
}
