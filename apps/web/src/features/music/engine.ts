// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Framework-free player for the background music under the narration.
 * Scope: One Web Audio graph per page (track → fade gain → volume gain → speakers), created on first
 *   use. Decodes tracks (keeping the two most recent), plays one track at a time with fades and
 *   crossfades, loops sample-accurately (skipping codec padding at the edges), remembers where a
 *   paused track was, stops and disconnects every faded-out track, suspends the audio context when
 *   nothing plays and reports tracks that fail to load. Each load is guarded by a generation counter
 *   so a track that was replaced while loading never starts.
 * Does NOT belong: When music plays (session.ts), the narration (it never passes through here) or UI.
 */

export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface BufferLike {
  readonly duration: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(when: number, offset: number): void;
  stop(when: number): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

export interface ContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** What should be heard: a track, and whether it carries on from where it was paused. */
export interface MusicTarget {
  id: string;
  url: string;
  resume: boolean;
}

export interface EngineEvents {
  /** A track is being fetched and decoded (null: nothing is). */
  onLoading: (id: string | null) => void;
  /** A track couldn't be played; `unavailable` when this browser has no Web Audio. */
  onError: (id: string, reason: 'unavailable' | 'failed') => void;
}

export interface EngineDeps extends EngineEvents {
  createContext: () => ContextLike;
  fetchTrack: (url: string) => Promise<ArrayBuffer>;
}

interface Voice {
  id: string;
  resumable: boolean;
  source: SourceLike;
  fade: GainLike;
  startedAt: number;
  offset: number;
  loopStart: number;
  loopEnd: number;
}

const KEEP_DECODED = 2;
const VOLUME_RAMP_SECONDS = 0.08;
const IDLE_SUSPEND_MS = 5_000;
/** Codec padding is at most a few tens of milliseconds; never trim more than this. */
const EDGE_SCAN_SECONDS = 0.2;
const SILENT = 1e-4;

function ramp(param: ParamLike, now: number, to: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + Math.max(seconds, 0.01));
}

/** Where the loop runs: the whole track minus digital silence that a decoder left at either edge. */
export function loopBounds(buffer: BufferLike): { start: number; end: number } {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const audible = (at: number) => channels.some((data) => Math.abs(Number(data[at])) > SILENT);
  const limit = Math.min(Math.floor(buffer.sampleRate * EDGE_SCAN_SECONDS), buffer.length >> 1);
  let first = 0;
  while (first < limit && !audible(first)) first += 1;
  let last = buffer.length;
  while (buffer.length - last < limit && !audible(last - 1)) last -= 1;
  // A track that is silent throughout keeps its full length rather than an empty loop.
  if (last <= first) return { start: 0, end: buffer.duration };
  return { start: first / buffer.sampleRate, end: last / buffer.sampleRate };
}

export class MusicEngine {
  private context: ContextLike | null = null;
  private master: GainLike | null = null;
  private current: Voice | null = null;
  private readonly fading = new Set<Voice>();
  private readonly decoded = new Map<string, BufferLike>();
  private readonly loading = new Map<string, Promise<BufferLike>>();
  private pendingId: string | null = null;
  private generation = 0;
  private volume = 0;
  private paused: { id: string; position: number } | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: EngineDeps) {}

  /** Music volume as a gain from 0 to 1; applied with a short ramp so dragging never crackles. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.context && this.master)
      ramp(this.master.gain, this.context.currentTime, volume, VOLUME_RAMP_SECONDS);
  }

  /** Make `target` the only track heard (null: none), fading or crossfading over `fade` seconds. */
  play(target: MusicTarget | null, fade: number): void {
    this.generation += 1;
    this.setPending(null);
    if (!target) {
      this.retire(fade);
      this.scheduleIdle();
      return;
    }
    if (this.current?.id === target.id) return;
    const context = this.ensureContext(target.id);
    if (!context) return;
    clearTimeout(this.idleTimer);
    if (context.state !== 'running') context.resume().catch(() => undefined);
    const buffer = this.decoded.get(target.id);
    if (buffer) {
      this.start(context, target, buffer, fade);
      return;
    }
    const generation = this.generation;
    this.setPending(target.id);
    this.load(context, target).then(
      (loaded) => {
        if (generation !== this.generation || this.context !== context) return;
        this.setPending(null);
        this.start(context, target, loaded, fade);
      },
      () => {
        if (generation !== this.generation) return;
        // Whatever plays keeps playing until the session decides what to do instead.
        this.setPending(null);
        this.deps.onError(target.id, 'failed');
      },
    );
  }

  /** Stop everything at once and release the audio context (a later `play` creates a new one). */
  dispose(): void {
    this.generation += 1;
    this.setPending(null);
    clearTimeout(this.idleTimer);
    for (const voice of [this.current, ...this.fading]) if (voice) this.release(voice);
    this.current = null;
    this.paused = null;
    this.decoded.clear();
    this.loading.clear();
    this.master = null;
    this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private setPending(id: string | null): void {
    if (id === this.pendingId) return;
    this.pendingId = id;
    this.deps.onLoading(id);
  }

  private ensureContext(id: string): ContextLike | null {
    if (this.context) return this.context;
    try {
      const context = this.deps.createContext();
      const master = context.createGain();
      master.gain.setValueAtTime(this.volume, context.currentTime);
      master.connect(context.destination);
      this.context = context;
      this.master = master;
      return context;
    } catch {
      this.deps.onError(id, 'unavailable');
      return null;
    }
  }

  private load(context: ContextLike, target: MusicTarget): Promise<BufferLike> {
    let promise = this.loading.get(target.id);
    if (!promise) {
      promise = this.deps
        .fetchTrack(target.url)
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          if (this.context === context) this.keep(target.id, buffer);
          return buffer;
        })
        .finally(() => this.loading.delete(target.id));
      this.loading.set(target.id, promise);
    }
    return promise;
  }

  /** Keep the most recently used decoded tracks only: a minute of stereo audio is about 23 MB. */
  private keep(id: string, buffer: BufferLike): void {
    this.decoded.delete(id);
    this.decoded.set(id, buffer);
    for (const old of this.decoded.keys()) {
      if (this.decoded.size <= KEEP_DECODED) break;
      if (old !== this.current?.id) this.decoded.delete(old);
    }
  }

  private start(context: ContextLike, target: MusicTarget, buffer: BufferLike, fade: number): void {
    this.retire(fade);
    this.keep(target.id, buffer);
    const { start, end } = loopBounds(buffer);
    const resumeAt = target.resume && this.paused?.id === target.id ? this.paused.position : start;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = end;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.max(fade, 0.01));
    source.connect(gain);
    gain.connect(this.master as GainLike);
    source.start(now, resumeAt);
    this.current = {
      id: target.id,
      resumable: target.resume,
      source,
      fade: gain,
      startedAt: now,
      offset: resumeAt,
      loopStart: start,
      loopEnd: end,
    };
  }

  /** Fade the current track out, remembering its place, and release it once it is silent. */
  private retire(fade: number): void {
    const voice = this.current;
    const context = this.context;
    if (!voice || !context) return;
    this.current = null;
    const stopAt = context.currentTime + Math.max(fade, 0.01);
    if (voice.resumable) this.paused = { id: voice.id, position: this.position(voice, stopAt) };
    ramp(voice.fade.gain, context.currentTime, 0, fade);
    this.fading.add(voice);
    voice.source.addEventListener('ended', () => this.release(voice));
    voice.source.stop(stopAt);
  }

  private position(voice: Voice, time: number): number {
    const length = voice.loopEnd - voice.loopStart;
    const played = voice.offset - voice.loopStart + (time - voice.startedAt);
    return voice.loopStart + (played % length);
  }

  private release(voice: Voice): void {
    this.fading.delete(voice);
    voice.source.disconnect();
    voice.fade.disconnect();
  }

  /** Let the audio device sleep once nothing has played for a while (`play` cancels this). */
  private scheduleIdle(): void {
    const context = this.context;
    if (!context) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      context.suspend().catch(() => undefined);
    }, IDLE_SUSPEND_MS);
  }
}
