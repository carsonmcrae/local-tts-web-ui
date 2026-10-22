// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Decide when sound effects play, following the narration player from outside.
 * Scope: Holds the effects state of this narration session: on or off (off whenever a different
 *   document, or none, is loaded and when the narration ends; only an explicit choice turns it
 *   on), volume and intensity (saved for next time, "on" never), what is previewing or loading, and
 *   the last notice. Given the document's effects and the library, it runs the scheduler on every
 *   player update: fires one-shots at their moment, starts and stops ambience with fades, ends an
 *   ambience that has run past the intensity's longest span, stops everything on a pause, seek,
 *   new document or the end, and previews a sound for a few seconds on request. A sound missing
 *   from the library, or one that fails to load, is skipped with a notice; the narration never waits.
 * Does NOT belong: Web Audio (engine.ts), the trigger rules (scheduler.ts), the narration or UI.
 */
import type { SfxEffect, SfxSound } from '@/api/types';
import type { PlayerState } from '@/features/player/controller';
import type { PlayerSource } from '@/features/player/follow';
import { followPlayer } from '@/features/player/follow';
import { clampVolume } from '@/lib/deviceSettings';
import type { Cue, EngineEvents } from './engine';
import type { Intensity, SfxChoice } from './preferences';
import { AMBIENCE_SECONDS, INTENSITY_GAIN } from './preferences';
import type { Playback } from './scheduler';
import { activeAmbience, dueOneShots, isFreshVisit } from './scheduler';

export interface SfxEngineLike {
  play(key: string, cue: Cue): void;
  stop(key: string, fade: number): void;
  stopAll(fade: number): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export interface SfxState {
  /** Effects are on for this narration. */
  enabled: boolean;
  /** 0–100 %. */
  volume: number;
  intensity: Intensity;
  /** The document the player holds (effects belong to it). */
  documentId: string | null;
  /** The sound being previewed from the library or a row, if any. */
  previewId: string | null;
  loadingKey: string | null;
  /** The ambience sounding now, by effect id. */
  ambienceId: string | null;
  notice: { soundId: string; message: string } | null;
}

export interface SessionDeps {
  player: PlayerSource;
  createEngine: (events: EngineEvents) => SfxEngineLike;
  choice: { read: () => SfxChoice; save: (choice: SfxChoice) => void };
  url: (sound: SfxSound) => string;
  /** The clock for ambience spans (milliseconds); defaults to Date.now. */
  now?: () => number;
}

/** Seconds each kind of change takes. */
export const FADES = {
  shot: 0.02,
  cut: 0.25,
  ambienceIn: 1,
  ambienceOut: 0.8,
  end: 1.5,
  off: 0.4,
} as const;
export const PREVIEW_SECONDS = 8;
const PREVIEW_KEY = 'preview';

export class SfxSession {
  private state: SfxState;
  private readonly listeners = new Set<(state: SfxState) => void>();
  private readonly engine: SfxEngineLike;
  private effects: readonly SfxEffect[] = [];
  private readonly sounds = new Map<string, SfxSound>();
  private readonly fired = new Set<string>();
  private readonly shots = new Set<string>();
  private last: Playback | null = null;
  private ambience: { id: string; startedAt: number } | null = null;
  private expiredId: string | null = null;
  private lastStatus: PlayerState['status'];
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: SessionDeps) {
    const choice = deps.choice.read();
    const player = deps.player.getState();
    this.state = {
      enabled: false,
      ...choice,
      documentId: player.document?.id ?? null,
      previewId: null,
      loadingKey: null,
      ambienceId: null,
      notice: null,
    };
    this.lastStatus = player.status;
    this.engine = deps.createEngine({
      onError: (soundId, reason) => this.fail(soundId, reason),
      onLoading: (key) => this.set({ loadingKey: key }),
    });
    this.applyVolume();
  }

  /** Follow the narration player; the returned function silences everything and lets go of it. */
  attach(): () => void {
    return followPlayer(
      this.deps.player,
      (player) => this.follow(player),
      () => {
        clearTimeout(this.previewTimer);
        this.set({ enabled: false, previewId: null, ambienceId: null });
        this.engine.dispose();
      },
    );
  }

  subscribe(listener: (state: SfxState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): SfxState {
    return this.state;
  }

  /** The bundled sounds, from the library query (effects whose sound is missing are skipped). */
  setLibrary(sounds: readonly SfxSound[]): void {
    this.sounds.clear();
    for (const sound of sounds) this.sounds.set(sound.id, sound);
  }

  /** The document's arrangement, from the query; a change takes effect at once. */
  setEffects(documentId: string, effects: readonly SfxEffect[]): void {
    if (documentId !== this.state.documentId) return;
    this.effects = effects;
    const kept = new Set(effects.filter((effect) => effect.enabled).map((effect) => effect.id));
    for (const key of this.shots) if (!kept.has(key)) this.engine.stop(key, FADES.cut);
    if (this.ambience && !kept.has(this.ambience.id)) this.stopAmbience(FADES.ambienceOut);
    this.follow(this.deps.player.getState());
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.state.enabled) return;
    this.set({ enabled, notice: null });
    if (enabled) this.follow(this.deps.player.getState());
    else this.silence(FADES.off);
  }

  setVolume(volume: number): void {
    const next = clampVolume(volume);
    if (next === this.state.volume) return;
    this.set({ volume: next });
    this.applyVolume();
    this.save();
  }

  setIntensity(intensity: Intensity): void {
    if (intensity === this.state.intensity) return;
    this.set({ intensity });
    this.applyVolume();
    this.save();
  }

  /** Hear a sound once (null: stop); a loop plays for PREVIEW_SECONDS. It doesn't turn effects on. */
  preview(soundId: string | null): void {
    clearTimeout(this.previewTimer);
    this.engine.stop(PREVIEW_KEY, FADES.cut);
    const sound = soundId === null ? undefined : this.sounds.get(soundId);
    if (!sound) {
      if (soundId !== null) this.fail(soundId, 'missing');
      else this.set({ previewId: null });
      return;
    }
    this.set({ previewId: sound.id, notice: null });
    this.engine.play(PREVIEW_KEY, this.cue(sound, sound.gain, FADES.shot));
    this.previewTimer = setTimeout(() => this.preview(null), PREVIEW_SECONDS * 1000);
  }

  private follow(player: PlayerState): void {
    const playback: Playback = {
      documentId: player.document?.id ?? null,
      segmentIndex: player.segmentIndex,
      currentTime: player.currentTime,
      duration: player.duration,
      status: player.status,
    };
    const ended = player.status === 'ended' && this.lastStatus !== 'ended';
    this.lastStatus = player.status;
    if (playback.documentId !== this.state.documentId) {
      // Another document (or none) is a new narration: effects go off and wait to be turned on.
      this.effects = [];
      this.set({ documentId: playback.documentId, enabled: false, notice: null });
      this.silence(FADES.off);
    } else if (ended) {
      this.set({ enabled: false });
      this.silence(FADES.end);
    }
    if (this.state.enabled) this.schedule(playback);
    this.last = playback;
  }

  private schedule(playback: Playback): void {
    if (isFreshVisit(this.last, playback)) this.fired.clear();
    if (playback.status !== 'playing') this.cutShots();
    for (const effect of dueOneShots(this.effects, playback, this.fired)) {
      this.fired.add(effect.id);
      const sound = this.sounds.get(effect.soundId);
      if (!sound) {
        this.fail(effect.soundId, 'missing');
        continue;
      }
      this.shots.add(effect.id);
      this.engine.play(effect.id, this.cue(sound, effect.volume / 100, FADES.shot));
    }
    this.followAmbience(activeAmbience(this.effects, playback));
  }

  private followAmbience(wanted: SfxEffect | null): void {
    const now = this.now();
    // An ambience that ran its full span stays off until the narration leaves it and comes back.
    if (this.expiredId !== null && wanted?.id !== this.expiredId) this.expiredId = null;
    if (this.ambience) {
      if (wanted?.id === this.ambience.id) {
        if (now - this.ambience.startedAt > AMBIENCE_SECONDS[this.state.intensity] * 1000) {
          this.expiredId = wanted.id;
          this.stopAmbience(FADES.end);
        }
        return;
      }
      this.stopAmbience(FADES.ambienceOut);
    }
    if (!wanted || wanted.id === this.expiredId) return;
    const sound = this.sounds.get(wanted.soundId);
    if (!sound) {
      this.expiredId = wanted.id;
      this.fail(wanted.soundId, 'missing');
      return;
    }
    this.ambience = { id: wanted.id, startedAt: now };
    this.set({ ambienceId: wanted.id });
    this.engine.play(wanted.id, this.cue(sound, wanted.volume / 100, FADES.ambienceIn));
  }

  private stopAmbience(fade: number): void {
    if (!this.ambience) return;
    this.engine.stop(this.ambience.id, fade);
    this.ambience = null;
    this.set({ ambienceId: null });
  }

  private cutShots(): void {
    for (const key of this.shots) this.engine.stop(key, FADES.cut);
    this.shots.clear();
  }

  private silence(fade: number): void {
    this.cutShots();
    this.stopAmbience(fade);
    this.fired.clear();
    this.expiredId = null;
    this.engine.stopAll(fade);
    this.set({ previewId: null });
  }

  private cue(sound: SfxSound, gain: number, fade: number): Cue {
    return { soundId: sound.id, url: this.deps.url(sound), loop: sound.loop, gain, fade };
  }

  private fail(soundId: string, reason: 'unavailable' | 'failed' | 'missing'): void {
    const name = this.sounds.get(soundId)?.name ?? soundId;
    const message =
      reason === 'unavailable'
        ? 'Sound effects aren’t available in this browser.'
        : reason === 'missing'
          ? `“${name}” isn’t in the sound library, so it is skipped.`
          : `“${name}” couldn’t be played. The narration carries on.`;
    this.set({
      notice: { soundId, message },
      previewId: null,
      enabled: reason !== 'unavailable' && this.state.enabled,
    });
  }

  private applyVolume(): void {
    this.engine.setVolume((this.state.volume / 100) * INTENSITY_GAIN[this.state.intensity]);
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private save(): void {
    this.deps.choice.save({ volume: this.state.volume, intensity: this.state.intensity });
  }

  private set(patch: Partial<SfxState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
