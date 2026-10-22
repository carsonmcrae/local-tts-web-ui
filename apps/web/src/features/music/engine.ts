// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Framework-free player for the background music under the narration.
 * Scope: One Web Audio graph per page (chunk sources → join gains → fade gain → volume gain →
 *   speakers), created on first use. Plays a track as its chunks back to back on a frame-exact
 *   timeline, the last leading into the first: it decodes only the chunk playing and the next one (so
 *   memory doesn't grow with a track's length), finds each chunk's music between the neighbours'
 *   frames it carries (whatever a decoder trimmed from its start), and crossfades every join over
 *   10 ms of the same music, so two separately encoded chunks meet without a step. One track at a time, with fades and crossfades (never more than
 *   two overlapping, however fast it is toggled); remembers where a paused track was; stops and
 *   disconnects every faded-out chunk; keeps a few decoded chunks for a quick resume; suspends the
 *   audio context when nothing plays and reports tracks that fail to load. Each load is guarded by a
 *   generation counter so a track replaced while loading never starts.
 * Does NOT belong: When music plays (session.ts), the narration (it never passes through here) or UI.
 */

import type { BufferLike, ContextLike, GainLike, SourceLike } from '@/lib/audio/webAudio';
import { createMaster, loadOnce, ramp, setMasterVolume } from '@/lib/audio/webAudio';

/** The rate the chunks were made at (scripts/media/music-library.mjs); frame counts are at it. */
const MUSIC_RATE = 48_000;

interface MusicChunkRef {
  url: string;
  /** Frames of music in the chunk, not counting the neighbours' frames it carries at each edge. */
  frames: number;
}

/** What should be heard: a track, and whether it carries on from where it was paused. */
export interface MusicTarget {
  id: string;
  chunks: readonly MusicChunkRef[];
  /** Frames of its neighbours every chunk carries before and after its music. */
  edgeFrames: number;
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
  target: MusicTarget;
  fade: GainLike;
  /** Chunks scheduled and not yet ended (the one playing and the one after it), with their join gains. */
  sources: Map<SourceLike, GainLike>;
  /** The context time at which the loop's position 0 played (or would have). */
  origin: number;
  /** The chunk to schedule next, when its music is due, and whether it is being decoded. */
  next: number;
  nextAt: number;
  queued: boolean;
}

/** Decoded chunks kept for a quick resume or switch back (20 s of stereo is about 7.7 MB). */
const KEEP_DECODED = 3;
/**
 * Each join is a crossfade this long: the next chunk starts early on the copy of the music it
 * carries before its own (20 ms, less what a decoder trimmed). Linear, because both are the same music.
 */
const JOIN_SECONDS = 0.01;
const VOLUME_RAMP_SECONDS = 0.08;
/** How quickly a track still fading out finishes when another fade begins. */
const HURRY_SECONDS = 0.05;
const IDLE_SUSPEND_MS = 5_000;

const bodySeconds = (chunk: MusicChunkRef) => chunk.frames / MUSIC_RATE;

/**
 * Where a chunk's music starts in its decoded buffer: after the neighbour's frames, less what the
 * decoder trimmed from the start (Chromium 156 trims 24 frames, other decoders none).
 */
function musicStart(buffer: BufferLike, chunk: MusicChunkRef, edgeFrames: number): number {
  const edge = edgeFrames / MUSIC_RATE;
  const trimmed = bodySeconds(chunk) + 2 * edge - buffer.duration;
  return edge - Math.min(Math.max(trimmed, 0), edge);
}

/** The chunk playing at `position` seconds into the loop, and how far into its music. */
function chunkAt(target: MusicTarget, position: number): { index: number; within: number } {
  let index = 0;
  let start = 0;
  const last = target.chunks.length - 1;
  while (index < last && position >= start + bodySeconds(target.chunks[index] as MusicChunkRef)) {
    start += bodySeconds(target.chunks[index] as MusicChunkRef);
    index += 1;
  }
  // Whole frames only, so every later chunk starts on a frame.
  return { index, within: Math.round((position - start) * MUSIC_RATE) / MUSIC_RATE };
}

const loopSeconds = (target: MusicTarget) =>
  target.chunks.reduce((sum, chunk) => sum + bodySeconds(chunk), 0);

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
    setMasterVolume(this.context, this.master, volume, VOLUME_RAMP_SECONDS);
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
    if (this.current?.target.id === target.id) return;
    const context = this.ensureContext(target.id);
    if (!context) return;
    clearTimeout(this.idleTimer);
    if (context.state !== 'running') context.resume().catch(() => undefined);
    const resumeAt = target.resume && this.paused?.id === target.id ? this.paused.position : 0;
    const at = chunkAt(target, resumeAt);
    const url = (target.chunks[at.index] as MusicChunkRef).url;
    const buffer = this.decoded.get(url);
    if (buffer) {
      this.start(context, target, buffer, at, fade);
      return;
    }
    const generation = this.generation;
    this.setPending(target.id);
    this.load(context, url).then(
      (loaded) => {
        if (generation !== this.generation || this.context !== context) return;
        this.setPending(null);
        this.start(context, target, loaded, at, fade);
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
    this.master?.disconnect();
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
      const master = createMaster(context, this.volume);
      this.context = context;
      this.master = master;
      return context;
    } catch {
      this.deps.onError(id, 'unavailable');
      return null;
    }
  }

  private load(context: ContextLike, url: string): Promise<BufferLike> {
    const cached = this.decoded.get(url);
    if (cached) {
      this.keep(url, cached);
      return Promise.resolve(cached);
    }
    return loadOnce(
      this.loading,
      url,
      () => this.deps.fetchTrack(url),
      context,
      (buffer) => {
        if (this.context === context) this.keep(url, buffer);
      },
    );
  }

  /** Keep the most recently used decoded chunks only (the ones playing are held by their sources). */
  private keep(url: string, buffer: BufferLike): void {
    this.decoded.delete(url);
    this.decoded.set(url, buffer);
    for (const old of this.decoded.keys()) {
      if (this.decoded.size <= KEEP_DECODED) break;
      this.decoded.delete(old);
    }
  }

  private start(
    context: ContextLike,
    target: MusicTarget,
    buffer: BufferLike,
    at: { index: number; within: number },
    fade: number,
  ): void {
    this.retire(fade);
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.max(fade, 0.01));
    gain.connect(this.master as GainLike);
    const before = target.chunks
      .slice(0, at.index)
      .reduce((sum, chunk) => sum + bodySeconds(chunk), 0);
    const voice: Voice = {
      target,
      fade: gain,
      sources: new Map(),
      origin: now - before - at.within,
      next: at.index,
      nextAt: now,
      queued: false,
    };
    this.current = voice;
    this.schedule(context, voice, buffer, at.within, false);
    this.queue(context, voice);
  }

  /**
   * Start chunk `voice.next` so its music (from `within` seconds in) is heard from `voice.nextAt`,
   * fading in over the join before it when it follows another chunk, and fading out over the join
   * after it, under the next chunk's fade-in; then move on.
   */
  private schedule(
    context: ContextLike,
    voice: Voice,
    buffer: BufferLike,
    within: number,
    joined: boolean,
  ): void {
    const chunk = voice.target.chunks[voice.next] as MusicChunkRef;
    const music = musicStart(buffer, chunk, voice.target.edgeFrames) + within;
    const lead = joined ? Math.min(JOIN_SECONDS, music) : 0;
    const length = bodySeconds(chunk) - within;
    const end = voice.nextAt + length;
    const gain = context.createGain();
    if (joined) {
      gain.gain.setValueAtTime(0, voice.nextAt - JOIN_SECONDS);
      gain.gain.linearRampToValueAtTime(1, voice.nextAt);
    }
    gain.gain.setValueAtTime(1, end - JOIN_SECONDS);
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(voice.fade);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.addEventListener('ended', () => this.ended(context, voice, source));
    source.start(voice.nextAt - lead, music - lead, lead + length);
    voice.sources.set(source, gain);
    voice.next = (voice.next + 1) % voice.target.chunks.length;
    voice.nextAt = end;
  }

  /** Decode the chunk after the last one scheduled and schedule it to start the moment that ends. */
  private queue(context: ContextLike, voice: Voice): void {
    voice.queued = true;
    const url = (voice.target.chunks[voice.next] as MusicChunkRef).url;
    this.load(context, url).then(
      (buffer) => {
        voice.queued = false;
        if (voice !== this.current) return;
        // Late (a slow decode or a sleeping tab): start as soon as its join fits, and the loop's
        // position moves with it.
        const late = Math.max(context.currentTime + JOIN_SECONDS - voice.nextAt, 0);
        voice.origin += late;
        voice.nextAt += late;
        this.schedule(context, voice, buffer, 0, true);
        if (voice.sources.size < 2) this.queue(context, voice);
      },
      () => {
        voice.queued = false;
        if (voice === this.current) this.deps.onError(voice.target.id, 'failed');
      },
    );
  }

  /** A chunk finished: the next one plays now, so decode the one after it. */
  private ended(context: ContextLike, voice: Voice, source: SourceLike): void {
    voice.sources.get(source)?.disconnect();
    voice.sources.delete(source);
    source.disconnect();
    if (voice === this.current) {
      if (!voice.queued) this.queue(context, voice);
    } else if (!voice.sources.size) {
      this.release(voice);
    }
  }

  /** Fade the current track out, remembering its place, and release it once it is silent. */
  private retire(fade: number): void {
    const voice = this.current;
    const context = this.context;
    if (!voice || !context) return;
    this.current = null;
    const now = context.currentTime;
    // A crossfade overlaps two tracks; anything still fading out from before finishes now.
    for (const older of this.fading) this.silence(older, now, HURRY_SECONDS);
    if (voice.target.resume)
      this.paused = {
        id: voice.target.id,
        position: this.position(voice, now + Math.max(fade, 0.01)),
      };
    this.fading.add(voice);
    this.silence(voice, now, fade);
  }

  private silence(voice: Voice, now: number, seconds: number): void {
    ramp(voice.fade.gain, now, 0, seconds);
    for (const source of voice.sources.keys()) {
      try {
        source.stop(now + Math.max(seconds, 0.01));
      } catch {
        // A browser that refuses a second stop() keeps the first, which is at most a fade away.
      }
    }
  }

  private position(voice: Voice, time: number): number {
    const length = loopSeconds(voice.target);
    return (((time - voice.origin) % length) + length) % length;
  }

  private release(voice: Voice): void {
    this.fading.delete(voice);
    for (const [source, gain] of voice.sources) {
      source.disconnect();
      gain.disconnect();
    }
    voice.sources.clear();
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
