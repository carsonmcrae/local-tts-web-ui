// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the rules that decide when sound effects play, following the narration player.
 * Scope: Off until turned on and never saved as on; one-shots fired once at their moment, cut on a
 *   pause and fired again on a replay; ambience kept under its span, through sentence fetches,
 *   stopped on leaving, pausing, or running past the intensity's longest span (and left off until the
 *   narration returns); everything stopped for a new document and at the end; effects changed while
 *   playing; missing and failing sounds; a browser without Web Audio; previews; volume and
 *   intensity saved and applied; detaching. The engine and player are fakes.
 * Does NOT belong: Web Audio (engine.test.ts) or the trigger rules alone (scheduler.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SfxSound } from '@/api/types';
import type { PlayerState } from '@/features/player/controller';
import type { Cue, EngineEvents } from './engine';
import { AMBIENCE_SECONDS } from './preferences';
import { effect } from './scheduler.test';
import type { PlayerSource } from '@/features/player/follow';
import type { SfxEngineLike } from './session';
import { FADES, PREVIEW_SECONDS, SfxSession } from './session';

class FakeEngine implements SfxEngineLike {
  calls: string[] = [];
  playing = new Map<string, Cue>();
  volume = -1;
  disposed = false;
  play(key: string, cue: Cue) {
    this.calls.push(`play:${key}`);
    this.playing.set(key, cue);
  }
  stop(key: string, fade: number) {
    this.calls.push(`stop:${key}:${fade}`);
    this.playing.delete(key);
  }
  stopAll(fade: number) {
    this.calls.push(`stopAll:${fade}`);
    this.playing.clear();
  }
  setVolume(volume: number) {
    this.volume = volume;
  }
  dispose() {
    this.disposed = true;
  }
}

class FakePlayer implements PlayerSource {
  state: PlayerState = {
    document: { id: 'doc', title: 'Doc', segmentCount: 20, estimatedSeconds: 100, sections: [] },
    segmentIndex: 0,
    status: 'paused',
    error: null,
    voiceId: 'kokoro:af_heart',
    rate: 1,
    pace: 1,
    currentTime: 0,
    duration: 10,
    sleep: null,
    volume: 1,
  };
  private readonly listeners = new Set<(state: PlayerState) => void>();
  getState() {
    return this.state;
  }
  subscribe(listener: (state: PlayerState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}

const sound = (id: string, loop: boolean): SfxSound => ({
  id,
  name: id,
  category: 'weather',
  description: '',
  keywords: [],
  file: `${id}.mp3`,
  durationSeconds: 3,
  bytes: 10,
  sha256: 'a'.repeat(64),
  gain: 0.6,
  loop,
  experimental: false,
  events: [id],
  licence: { name: 'MIT', url: 'https://example.invalid' },
  attribution: null,
  source: 'test',
});
const SOUNDS = [sound('thud', false), sound('rain-light', true)];
const SHOT = effect({ id: 'shot', segmentIndex: 3, soundId: 'thud', volume: 70 });
const RAIN = effect({
  id: 'rain',
  segmentIndex: 5,
  untilSegment: 8,
  soundId: 'rain-light',
  volume: 40,
});

function harness(effects = [SHOT, RAIN]) {
  const engine = new FakeEngine();
  const player = new FakePlayer();
  const save = vi.fn();
  let events: EngineEvents | undefined;
  let clock = 0;
  const session = new SfxSession({
    player,
    createEngine: (given) => {
      events = given;
      return engine;
    },
    choice: { read: () => ({ volume: 50, intensity: 'balanced' }), save },
    url: (entry) => `/sfx/${entry.file}`,
    now: () => clock,
  });
  session.setLibrary(SOUNDS);
  const detach = session.attach();
  session.setEffects('doc', effects);
  const tick = (seconds: number) => {
    clock += seconds * 1000;
  };
  return { engine, player, session, save, detach, tick, events: () => events as EngineEvents };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sound-effects session', () => {
  it('is off until turned on, applies the saved volume, and never saves "on"', () => {
    const { engine, player, session, save } = harness();
    expect(session.getState().enabled).toBe(false);
    expect(engine.volume).toBe(0.5);
    player.emit({ status: 'playing', segmentIndex: 3, currentTime: 0.1 });
    expect(engine.calls).toEqual([]);
    session.setEnabled(true);
    expect(engine.calls).toEqual(['play:shot']);
    session.setEnabled(true);
    expect(save).not.toHaveBeenCalled();
    session.setVolume(80);
    session.setVolume(80);
    session.setIntensity('immersive');
    session.setIntensity('immersive');
    expect(engine.volume).toBeCloseTo(0.8 * 1.15);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ volume: 80, intensity: 'immersive' });
  });

  it('fires a one-shot once at its moment, cuts it on a pause and fires it again on a replay', () => {
    const { engine, player, session } = harness();
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 3, currentTime: 0.1 });
    expect(engine.playing.get('shot')).toEqual({
      soundId: 'thud',
      url: '/sfx/thud.mp3',
      loop: false,
      gain: 0.7,
      fade: FADES.shot,
    });
    player.emit({ currentTime: 0.5 });
    player.emit({ status: 'paused' });
    expect(engine.calls).toEqual(['play:shot', `stop:shot:${FADES.cut}`]);
    player.emit({ status: 'playing', currentTime: 0.6 });
    expect(engine.calls).toHaveLength(2);
    player.emit({ currentTime: 0 });
    expect(engine.calls.at(-1)).toBe('play:shot');
  });

  it('keeps an ambience under its sentences, through fetches, and stops it on leaving', () => {
    const { engine, player, session } = harness();
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 5, currentTime: 0.1 });
    expect(engine.playing.get('rain')?.fade).toBe(FADES.ambienceIn);
    expect(session.getState().ambienceId).toBe('rain');
    player.emit({ status: 'loading', segmentIndex: 6, currentTime: 0 });
    player.emit({ status: 'playing', segmentIndex: 6, currentTime: 0.2 });
    expect(engine.calls).toEqual(['play:rain']);
    player.emit({ status: 'paused' });
    expect(engine.calls.at(-1)).toBe(`stop:rain:${FADES.ambienceOut}`);
    player.emit({ status: 'playing', segmentIndex: 7, currentTime: 0 });
    expect(engine.calls.at(-1)).toBe('play:rain');
    player.emit({ status: 'playing', segmentIndex: 9, currentTime: 0 });
    expect(engine.calls.at(-1)).toBe(`stop:rain:${FADES.ambienceOut}`);
    expect(session.getState().ambienceId).toBeNull();
  });

  it('ends an ambience that ran its full span, and keeps it off until the narration returns', () => {
    const { engine, player, session, tick } = harness();
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 5, currentTime: 0.1 });
    tick(AMBIENCE_SECONDS.balanced + 1);
    player.emit({ segmentIndex: 6, currentTime: 0 });
    expect(engine.calls.at(-1)).toBe(`stop:rain:${FADES.end}`);
    player.emit({ segmentIndex: 7, currentTime: 0 });
    expect(engine.calls).toHaveLength(2);
    player.emit({ segmentIndex: 9, currentTime: 0 });
    player.emit({ segmentIndex: 6, currentTime: 0 });
    expect(engine.calls.at(-1)).toBe('play:rain');
  });

  it('goes off for a new document and when the narration ends', () => {
    const { engine, player, session } = harness();
    session.setEnabled(true);
    player.emit({ status: 'ended' });
    expect(session.getState().enabled).toBe(false);
    expect(engine.calls.at(-1)).toBe(`stopAll:${FADES.end}`);
    player.emit({ status: 'ended' });
    session.setEnabled(true);
    player.emit({ document: { ...player.state.document!, id: 'other' }, status: 'playing' });
    expect(session.getState()).toMatchObject({ enabled: false, documentId: 'other' });
    expect(engine.calls.at(-1)).toBe(`stopAll:${FADES.off}`);
    session.setEffects('doc', [SHOT]); // a stale answer for the old document is ignored
    session.setEnabled(true);
    player.emit({ segmentIndex: 3, currentTime: 0.1 });
    expect(engine.playing.size).toBe(0);
    session.setEnabled(false);
    expect(engine.calls.at(-1)).toBe(`stopAll:${FADES.off}`);
  });

  it('stops an effect that is turned off or removed while it plays', () => {
    const { engine, player, session } = harness();
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 5, currentTime: 0.1 });
    session.setEffects('doc', [SHOT, RAIN]); // unchanged: the ambience carries on
    expect(engine.calls).toEqual(['play:rain']);
    session.setEffects('doc', [SHOT, { ...RAIN, enabled: false }]);
    expect(engine.calls.at(-1)).toBe(`stop:rain:${FADES.ambienceOut}`);
    player.emit({ segmentIndex: 3, currentTime: 0.1 });
    session.setEffects('doc', [SHOT]); // still there and on: nothing stops
    expect(engine.calls.at(-1)).toBe('play:shot');
    session.setEffects('doc', []);
    expect(engine.calls.at(-1)).toBe(`stop:shot:${FADES.cut}`);
  });

  it('skips sounds the library lacks, reports failures, and turns off without Web Audio', () => {
    const { engine, player, session, events } = harness([
      { ...SHOT, soundId: 'ghost' },
      { ...RAIN, soundId: 'ghost-loop' },
    ]);
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 3, currentTime: 0.1 });
    expect(session.getState().notice?.message).toMatch(/“ghost” isn’t in the sound library/);
    expect(session.getState().enabled).toBe(true);
    player.emit({ segmentIndex: 5, currentTime: 0.1 });
    expect(session.getState().notice?.message).toMatch(/ghost-loop/);
    player.emit({ segmentIndex: 6, currentTime: 0.1 });
    expect(engine.calls).toEqual([]);
    events().onError('thud', 'failed');
    expect(session.getState().notice?.message).toMatch(/“thud” couldn’t be played/);
    events().onLoading?.('shot');
    expect(session.getState().loadingKey).toBe('shot');
    events().onError('thud', 'unavailable');
    expect(session.getState()).toMatchObject({ enabled: false, notice: { soundId: 'thud' } });
  });

  it('previews one sound at a time, for a few seconds', () => {
    const { engine, session } = harness();
    session.preview('thud');
    expect(session.getState().previewId).toBe('thud');
    expect(engine.playing.get('preview')?.gain).toBe(0.6);
    session.preview('rain-light');
    expect(engine.calls.filter((call) => call.startsWith('play'))).toHaveLength(2);
    expect(engine.calls.slice(-3)).toEqual([
      'play:preview',
      `stop:preview:${FADES.cut}`,
      'play:preview',
    ]);
    vi.advanceTimersByTime(PREVIEW_SECONDS * 1000 + 1);
    expect(session.getState().previewId).toBeNull();
    expect(engine.playing.size).toBe(0);
    session.preview('nope');
    expect(session.getState().notice?.message).toMatch(/“nope” isn’t in the sound library/);
    session.preview(null);
    expect(session.getState().previewId).toBeNull();
  });

  it('silences everything and lets go of the engine when detached', () => {
    const { engine, player, session, detach } = harness();
    session.setEnabled(true);
    player.emit({ status: 'playing', segmentIndex: 5, currentTime: 0.1 });
    detach();
    expect(engine.disposed).toBe(true);
    expect(session.getState()).toMatchObject({ enabled: false, ambienceId: null });
    player.emit({ segmentIndex: 6 });
    expect(engine.calls.filter((call) => call.startsWith('play'))).toHaveLength(1);
  });
});
