// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Decide when background music plays, following the narration player from outside.
 * Scope: Holds the music state of this narration session (on/off, track, volume, preview, loading,
 *   error). A session is one document in the player: music is off whenever a different document (or
 *   none) is loaded and when the narration ends, and only an explicit choice turns it on. The chosen
 *   track plays while the narration plays or fetches its next sentence and pauses with it; previews
 *   last up to 20 seconds; each change gets its own fade. Track and volume are saved, "on" never.
 * Does NOT belong: Web Audio (engine.ts), the narration state machine (controller.ts) or UI.
 */
import type { PlayerState } from '@/features/player/controller';
import type { EngineEvents, MusicTarget } from './engine';
import type { MusicTrack } from './library';
import type { MusicChoice } from './preferences';
import { clampVolume } from './preferences';

export interface MusicEngineLike {
  play(target: MusicTarget | null, fade: number): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export interface PlayerSource {
  getState(): PlayerState;
  subscribe(listener: (state: PlayerState) => void): () => void;
}

export interface MusicState {
  /** Music is on for this narration. */
  enabled: boolean;
  trackId: string;
  /** 0–100 %. */
  volume: number;
  previewId: string | null;
  loadingId: string | null;
  error: { trackId: string; message: string } | null;
}

export interface SessionDeps {
  player: PlayerSource;
  tracks: readonly MusicTrack[];
  url: (track: MusicTrack) => string;
  createEngine: (events: EngineEvents) => MusicEngineLike;
  choice: { read: () => MusicChoice; save: (choice: MusicChoice) => void };
}

/** Seconds each kind of change takes: gentle, but quick to get out of the way of a pause. */
export const FADES = {
  on: 1.5,
  off: 1.2,
  pause: 0.4,
  resume: 1,
  change: 2,
  end: 2.5,
  preview: 0.6,
} as const;
export const PREVIEW_SECONDS = 20;

const narrating = (player: PlayerState) =>
  player.status === 'playing' || player.status === 'loading';

export class MusicSession {
  private state: MusicState;
  private readonly listeners = new Set<(state: MusicState) => void>();
  private readonly engine: MusicEngineLike;
  private documentId: string | null;
  private lastStatus: PlayerState['status'];
  /** The track last handed to the engine (null: silence), so repeated player updates cost nothing. */
  private heard: string | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: SessionDeps) {
    const choice = deps.choice.read();
    this.state = { enabled: false, ...choice, previewId: null, loadingId: null, error: null };
    const player = deps.player.getState();
    this.documentId = player.document?.id ?? null;
    this.lastStatus = player.status;
    this.engine = deps.createEngine({
      onLoading: (id) => this.set({ loadingId: id }),
      onError: (id, reason) => this.fail(id, reason),
    });
    this.engine.setVolume(choice.volume / 100);
  }

  /** Follow the narration player; the returned function silences the music and lets go of it. */
  attach(): () => void {
    const unsubscribe = this.deps.player.subscribe((player) => this.follow(player));
    return () => {
      unsubscribe();
      clearTimeout(this.previewTimer);
      this.heard = null;
      this.set({ enabled: false, previewId: null });
      this.engine.dispose();
    };
  }

  subscribe(listener: (state: MusicState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): MusicState {
    return this.state;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.state.enabled) return;
    this.set({ enabled, error: null });
    this.sync(enabled ? FADES.on : FADES.off);
  }

  /** Choose the track (saved for next time); while music plays it crossfades to it. */
  selectTrack(trackId: string): void {
    if (trackId === this.state.trackId || !this.track(trackId)) return;
    this.set({ trackId, error: null });
    this.save();
    this.sync(FADES.change);
  }

  /** Music volume in % (saved for next time); the narration's volume is never touched. */
  setVolume(volume: number): void {
    const next = clampVolume(volume);
    if (next === this.state.volume) return;
    this.engine.setVolume(next / 100);
    this.set({ volume: next });
    this.save();
  }

  /** Hear a track for up to PREVIEW_SECONDS (null: stop); it doesn't turn music on. */
  preview(trackId: string | null): void {
    if (trackId !== null && !this.track(trackId)) return;
    clearTimeout(this.previewTimer);
    if (trackId !== null)
      this.previewTimer = setTimeout(() => this.preview(null), PREVIEW_SECONDS * 1000);
    this.set({ previewId: trackId, error: null });
    this.sync(FADES.preview);
  }

  private follow(player: PlayerState): void {
    const documentId = player.document?.id ?? null;
    const ended = player.status === 'ended' && this.lastStatus !== 'ended';
    this.lastStatus = player.status;
    if (documentId !== this.documentId || ended) {
      // Another document (or none) is a new narration, and a finished one is over: either way the
      // music goes off and waits to be turned on again.
      this.documentId = documentId;
      if (this.state.enabled) this.set({ enabled: false });
      this.sync(ended ? FADES.end : FADES.off);
    } else {
      // The player reports a pause only when the listener (or a sleep timer, or an error) stops
      // the narration; moving between sentences stays 'playing' or 'loading'.
      this.sync(narrating(player) ? FADES.resume : FADES.pause);
    }
  }

  private target(): MusicTarget | null {
    const { previewId, enabled, trackId } = this.state;
    const id = previewId ?? (enabled && narrating(this.deps.player.getState()) ? trackId : null);
    const track = id === null ? undefined : this.track(id);
    return track ? { id: track.id, url: this.deps.url(track), resume: previewId === null } : null;
  }

  private sync(fade: number): void {
    const target = this.target();
    const id = target?.id ?? null;
    if (id === this.heard) return;
    this.heard = id;
    this.engine.play(target, fade);
  }

  private fail(trackId: string, reason: 'unavailable' | 'failed'): void {
    const title = this.track(trackId)?.title ?? 'this track';
    const message =
      reason === 'unavailable'
        ? 'Background music isn’t available in this browser.'
        : `Couldn’t play “${title}”. The narration carries on.`;
    // A failed preview gives way to the chosen track; a failed chosen track turns music off.
    const keepOn = reason === 'failed' && trackId !== this.state.trackId && this.state.enabled;
    clearTimeout(this.previewTimer);
    this.set({ error: { trackId, message }, previewId: null, enabled: keepOn });
    this.sync(FADES.off);
  }

  private track(id: string): MusicTrack | undefined {
    return this.deps.tracks.find((track) => track.id === id);
  }

  private save(): void {
    this.deps.choice.save({ trackId: this.state.trackId, volume: this.state.volume });
  }

  private set(patch: Partial<MusicState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
