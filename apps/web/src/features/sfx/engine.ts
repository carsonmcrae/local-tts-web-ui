// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Framework-free Web Audio player for sound effects beside the narration.
 * Scope: One graph per page, made on first use: each playing effect is a buffer source → its own
 *   gain (fades) → a compressor set as a limiter → the master volume → the speakers. Decodes a
 *   sound once and keeps the twelve most recent; plays a one-shot to its end or a loop (with the
 *   codec's silent edges trimmed) until stopped; allows two one-shots and one loop at once and
 *   skips what would be a third; fades in and out; releases every node when it ends; suspends the
 *   context when nothing has played for a while and closes it on dispose. Each start is guarded by a
 *   generation counter, so an effect stopped while its sound was loading never plays. The
 *   narration never passes through here, so nothing in it can touch the speech.
 * Does NOT belong: When effects play (scheduler.ts, session.ts), the catalogue or the interface.
 */

import type {
  BufferLike,
  ContextLike,
  GainLike,
  NodeLike,
  ParamLike,
  SourceLike,
} from '@/lib/audio/webAudio';
import { createMaster, loadOnce, loopBounds, ramp, setMasterVolume } from '@/lib/audio/webAudio';

export interface CompressorLike extends NodeLike {
  readonly threshold: ParamLike;
  readonly knee: ParamLike;
  readonly ratio: ParamLike;
  readonly attack: ParamLike;
  readonly release: ParamLike;
}

/** A context that can also make the limiter. */
export interface SfxContextLike extends ContextLike {
  createDynamicsCompressor(): CompressorLike;
}

/** What to play under one key (an effect's id, or a preview). */
export interface Cue {
  soundId: string;
  url: string;
  loop: boolean;
  /** 0–1.5: the effect's own level on top of the master volume. */
  gain: number;
  /** Seconds to fade in. */
  fade: number;
}

export interface EngineEvents {
  /** A sound couldn't be played; `unavailable` when this browser has no Web Audio. */
  onError: (soundId: string, reason: 'unavailable' | 'failed') => void;
  /** A sound is being fetched and decoded for `key` (null: nothing is). */
  onLoading?: (key: string | null) => void;
}

export interface EngineDeps extends EngineEvents {
  createContext: () => SfxContextLike;
  fetchSound: (url: string) => Promise<ArrayBuffer>;
}

interface Voice {
  key: string;
  soundId: string;
  loop: boolean;
  source: SourceLike;
  gain: GainLike;
}

export const MAX_ONE_SHOTS = 2;
export const KEEP_DECODED = 12;
export const MAX_GAIN = 1.5;
const VOLUME_RAMP_SECONDS = 0.05;
const IDLE_SUSPEND_MS = 5_000;
/** -80 dBFS: a synthesised sound's edges are quieter than this, codec noise included. */
const SILENT = 1e-4;
/** The limiter: nothing above about -10 dBFS gets through, however the gains add up. */
const LIMITER = { threshold: -10, knee: 0, ratio: 12, attack: 0.003, release: 0.25 } as const;

export class SfxEngine {
  private context: SfxContextLike | null = null;
  private master: GainLike | null = null;
  private limiter: CompressorLike | null = null;
  private readonly voices = new Map<string, Voice>();
  private readonly fading = new Set<Voice>();
  private readonly decoded = new Map<string, BufferLike>();
  private readonly loading = new Map<string, Promise<BufferLike>>();
  private readonly pending = new Map<string, number>();
  private generation = 0;
  private volume = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: EngineDeps) {}

  isPlaying(key: string): boolean {
    return this.voices.has(key) || this.pending.has(key);
  }

  /** Master volume as a gain from 0 to 1, applied with a short ramp. */
  setVolume(volume: number): void {
    this.volume = volume;
    setMasterVolume(this.context, this.master, volume, VOLUME_RAMP_SECONDS);
  }

  /** Start `cue` under `key` unless it already plays or the limits leave no room for it. */
  play(key: string, cue: Cue): void {
    if (this.isPlaying(key) || !this.hasRoom(cue.loop)) return;
    const context = this.ensureContext(cue.soundId);
    if (!context) return;
    clearTimeout(this.idleTimer);
    if (context.state !== 'running') context.resume().catch(() => undefined);
    const buffer = this.decoded.get(cue.soundId);
    if (buffer) {
      this.start(context, key, cue, buffer);
      return;
    }
    const generation = ++this.generation;
    this.pending.set(key, generation);
    this.deps.onLoading?.(key);
    this.load(context, cue).then(
      (loaded) => {
        if (this.pending.get(key) !== generation || this.context !== context) return;
        this.pending.delete(key);
        this.deps.onLoading?.(null);
        if (this.hasRoom(cue.loop)) this.start(context, key, cue, loaded);
      },
      () => {
        if (this.pending.get(key) !== generation) return;
        this.pending.delete(key);
        this.deps.onLoading?.(null);
        this.deps.onError(cue.soundId, 'failed');
      },
    );
  }

  /** Fade `key` out over `fade` seconds and release it (nothing happens if it isn't playing). */
  stop(key: string, fade: number): void {
    if (this.pending.delete(key)) this.deps.onLoading?.(null);
    const voice = this.voices.get(key);
    if (!voice) return;
    this.voices.delete(key);
    this.retire(voice, fade);
    if (this.voices.size === 0) this.scheduleIdle();
  }

  stopAll(fade: number): void {
    for (const key of [...this.voices.keys(), ...this.pending.keys()]) this.stop(key, fade);
  }

  /** Stop everything at once and release the audio context (a later `play` creates a new one). */
  dispose(): void {
    this.generation += 1;
    this.pending.clear();
    clearTimeout(this.idleTimer);
    for (const voice of [...this.voices.values(), ...this.fading]) {
      try {
        voice.source.stop(0);
      } catch {
        // Already stopped: a source may only be stopped once.
      }
      this.release(voice);
    }
    this.voices.clear();
    this.decoded.clear();
    this.loading.clear();
    this.limiter?.disconnect();
    this.master?.disconnect();
    this.master = null;
    this.limiter = null;
    this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private hasRoom(loop: boolean): boolean {
    let loops = 0;
    let shots = 0;
    for (const voice of this.voices.values()) {
      if (voice.loop) loops += 1;
      else shots += 1;
    }
    return loop ? loops === 0 : shots < MAX_ONE_SHOTS;
  }

  private ensureContext(soundId: string): SfxContextLike | null {
    if (this.context) return this.context;
    try {
      const context = this.deps.createContext();
      const master = createMaster(context, this.volume);
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(LIMITER.threshold, context.currentTime);
      limiter.knee.setValueAtTime(LIMITER.knee, context.currentTime);
      limiter.ratio.setValueAtTime(LIMITER.ratio, context.currentTime);
      limiter.attack.setValueAtTime(LIMITER.attack, context.currentTime);
      limiter.release.setValueAtTime(LIMITER.release, context.currentTime);
      limiter.connect(master);
      this.context = context;
      this.master = master;
      this.limiter = limiter;
      return context;
    } catch {
      this.deps.onError(soundId, 'unavailable');
      return null;
    }
  }

  private load(context: ContextLike, cue: Cue): Promise<BufferLike> {
    return loadOnce(
      this.loading,
      cue.soundId,
      () => this.deps.fetchSound(cue.url),
      context,
      (buffer) => {
        if (this.context === context) this.keep(cue.soundId, buffer);
      },
    );
  }

  /** Keep the most recently used decoded sounds only (a few seconds of mono audio each). */
  private keep(soundId: string, buffer: BufferLike): void {
    this.decoded.delete(soundId);
    this.decoded.set(soundId, buffer);
    const inUse = new Set([...this.voices.values()].map((voice) => voice.soundId));
    for (const old of this.decoded.keys()) {
      if (this.decoded.size <= KEEP_DECODED) break;
      if (!inUse.has(old)) this.decoded.delete(old);
    }
  }

  private start(context: ContextLike, key: string, cue: Cue, buffer: BufferLike): void {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    let offset = 0;
    if (cue.loop) {
      const { start, end } = loopBounds(buffer, SILENT);
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = end;
      offset = start;
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(Math.min(cue.gain, MAX_GAIN), now + Math.max(cue.fade, 0.01));
    source.connect(gain);
    gain.connect(this.limiter as CompressorLike);
    const voice: Voice = { key, soundId: cue.soundId, loop: cue.loop, source, gain };
    source.addEventListener('ended', () => {
      if (this.voices.get(key) === voice) {
        this.voices.delete(key);
        this.release(voice);
        if (this.voices.size === 0) this.scheduleIdle();
      }
    });
    source.start(now, offset);
    this.voices.set(key, voice);
  }

  private retire(voice: Voice, fade: number): void {
    const context = this.context as ContextLike; // a voice only exists while the context does
    ramp(voice.gain.gain, context.currentTime, 0, fade);
    this.fading.add(voice);
    voice.source.addEventListener('ended', () => this.release(voice));
    voice.source.stop(context.currentTime + Math.max(fade, 0.01));
  }

  private release(voice: Voice): void {
    this.fading.delete(voice);
    voice.source.disconnect();
    voice.gain.disconnect();
  }

  /** Let the audio device sleep once nothing has played for a while (`play` cancels this). */
  private scheduleIdle(): void {
    const context = this.context as ContextLike; // called only while a voice just ended or stopped
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      context.suspend().catch(() => undefined);
    }, IDLE_SUSPEND_MS);
  }
}
