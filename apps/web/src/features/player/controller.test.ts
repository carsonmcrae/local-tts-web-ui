// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Behavioural tests for the PlaybackController state machine.
 * Scope: Loading without autoplay, playback with prefetch, auto-advance on `ended`, stale-request
 *   protection when skipping, section navigation, voice/pace changes, error and autoplay-block
 *   handling, the sleep timer, and progress persistence — using a fake media element, fetcher and
 *   clock.
 * Does NOT belong: React rendering (PlayerBar tests) or real audio.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ControllerDeps, MediaLike, PlayerDocument } from './controller';
import { PlaybackController } from './controller';

class FakeMedia implements MediaLike {
  src = '';
  currentTime = 0;
  playbackRate = 1;
  preservesPitch = true;
  playError: unknown = null;
  private listeners = new Map<string, (() => void)[]>();
  play = vi.fn(async () => {
    if (this.playError) throw this.playError;
  });
  pause = vi.fn();
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

const DOC: PlayerDocument = {
  id: 'doc',
  title: 'Doc',
  segmentCount: 6,
  estimatedSeconds: 30,
  sections: [
    { index: 0, title: 'One', startSegment: 0, segmentCount: 3 },
    { index: 1, title: 'Two', startSegment: 3, segmentCount: 3 },
  ],
};

function setup(overrides: Partial<ControllerDeps> = {}) {
  const media = new FakeMedia();
  const requests: {
    index: number;
    voice: string;
    pace: number;
    prefetch: boolean;
    signal: AbortSignal;
  }[] = [];
  const pending = new Map<number, { resolve: () => void; reject: (error: unknown) => void }>();
  const deps: ControllerDeps = {
    media,
    fetchSegment: (_doc, index, voice, pace, prefetch, signal) => {
      requests.push({ index, voice, pace, prefetch, signal });
      return Promise.resolve({ url: `blob:${voice}:${index}`, duration: 2 });
    },
    saveProgress: vi.fn(),
    toError: (error) => ({ code: 'test', message: String(error) }),
    ...overrides,
  };
  const controller = new PlaybackController(deps, { voiceId: 'kokoro:a', rate: 1, pace: 1 });
  return { controller, media, requests, deps, pending };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PlaybackController', () => {
  it('loads a document at a position without fetching audio until played', async () => {
    const { controller, requests, deps } = setup();
    await controller.load(DOC, 2, false);
    expect(controller.getState()).toMatchObject({ segmentIndex: 2, status: 'paused' });
    expect(requests).toHaveLength(0);
    expect(deps.saveProgress).toHaveBeenCalledWith('doc', 2, 'kokoro:a');
  });

  it('plays the current segment and prefetches the next three at lower priority', async () => {
    const { controller, media, requests } = setup();
    await controller.load(DOC, 0, true);
    expect(media.src).toBe('blob:kokoro:a:0');
    expect(controller.getState().status).toBe('playing');
    expect(requests.map((r) => [r.index, r.prefetch])).toEqual([
      [0, false],
      [1, true],
      [2, true],
      [3, true],
    ]);
  });

  it('advances automatically and ends after the last segment', async () => {
    const { controller, media } = setup();
    await controller.load(DOC, 4, true);
    media.emit('ended');
    await flush();
    expect(controller.getState().segmentIndex).toBe(5);
    expect(media.src).toBe('blob:kokoro:a:5');
    media.emit('ended');
    expect(controller.getState().status).toBe('ended');
  });

  it('never plays stale audio when the listener skips quickly', async () => {
    const { controller, media, requests } = setup();
    let release: () => void = () => undefined;
    const slow = new Promise<{ url: string; duration: number }>((resolve) => {
      release = () => resolve({ url: 'blob:stale', duration: 1 });
    });
    const deps = (controller as unknown as { deps: ControllerDeps }).deps;
    const original = deps.fetchSegment;
    deps.fetchSegment = (doc, index, ...rest) =>
      index === 0 ? slow : original(doc, index, ...rest);
    const first = controller.load(DOC, 0, true);
    await controller.next();
    release();
    await first;
    expect(media.src).toBe('blob:kokoro:a:1');
    expect(controller.getState().segmentIndex).toBe(1);
    expect(requests.some((r) => r.index === 0)).toBe(false);
  });

  it('navigates sections and restarts the sentence when "previous" is pressed mid-sentence', async () => {
    const { controller, media } = setup();
    await controller.load(DOC, 1, true);
    await controller.nextSection();
    expect(controller.getState().segmentIndex).toBe(3);
    await controller.previousSection();
    expect(controller.getState().segmentIndex).toBe(0);
    await controller.seek(4);
    media.currentTime = 3;
    await controller.previous();
    expect(controller.getState().segmentIndex).toBe(4);
    media.currentTime = 0;
    await controller.previous();
    expect(controller.getState().segmentIndex).toBe(3);
    expect(controller.sectionAt(4)?.title).toBe('Two');
  });

  it('re-fetches with a new voice or pace', async () => {
    const { controller, media, requests } = setup();
    await controller.load(DOC, 0, true);
    await controller.setVoice('kokoro:b');
    expect(media.src).toBe('blob:kokoro:b:0');
    await controller.setPace(1.2);
    expect(requests.at(-4)).toMatchObject({ index: 0, voice: 'kokoro:b', pace: 1.2 });
    controller.setRate(1.5);
    expect(media.playbackRate).toBe(1.5);
  });

  it('surfaces fetch errors and recovers on retry', async () => {
    const { controller, media } = setup();
    const deps = (controller as unknown as { deps: ControllerDeps }).deps;
    const original = deps.fetchSegment;
    deps.fetchSegment = () => Promise.reject(new Error('engine missing'));
    await controller.load(DOC, 0, true);
    expect(controller.getState()).toMatchObject({
      status: 'error',
      error: { message: 'Error: engine missing' },
    });
    deps.fetchSegment = original;
    await controller.play();
    expect(controller.getState().status).toBe('playing');
    expect(media.src).toBe('blob:kokoro:a:0');
  });

  it('stays paused (not errored) when the browser blocks autoplay', async () => {
    const { controller, media } = setup();
    media.playError = new DOMException('blocked', 'NotAllowedError');
    await controller.load(DOC, 0, true);
    expect(controller.getState().status).toBe('paused');
  });

  it('toggles, pauses and persists progress', async () => {
    const { controller, media, deps } = setup();
    await controller.load(DOC, 0, true);
    await controller.toggle();
    expect(controller.getState().status).toBe('paused');
    expect(media.pause).toHaveBeenCalled();
    await controller.toggle();
    expect(controller.getState().status).toBe('playing');
    controller.unload();
    expect(controller.getState()).toMatchObject({ document: null, status: 'idle' });
    expect(deps.saveProgress).toHaveBeenCalled();
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const { controller } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.load(DOC, 0, false);
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
    await controller.seek(1);
    expect(listener.mock.calls.length).toBe(calls);
  });
});

describe('PlaybackController edge cases', () => {
  it('ignores commands and media events until a document is loaded', async () => {
    const { controller, media, requests } = setup();
    await controller.play();
    await controller.next();
    await controller.nextSection();
    await controller.previousSection();
    await controller.setVoice('kokoro:b');
    controller.pause();
    media.emit('ended');
    expect(controller.getState()).toMatchObject({ status: 'idle', voiceId: 'kokoro:b' });
    expect(requests).toHaveLength(0);
  });

  it('stops between sentences when the sleep timer runs out', async () => {
    const clock = { now: 0 };
    const { controller, media } = setup({ now: () => clock.now });
    controller.setSleepTimer(1);
    expect(controller.getState().sleep).toEqual({ kind: 'minutes', endsAt: 60_000 });
    await controller.load(DOC, 0, true);
    clock.now = 30_000;
    media.emit('ended');
    await flush();
    expect(controller.getState()).toMatchObject({ segmentIndex: 1, status: 'playing' });
    clock.now = 61_000;
    media.emit('ended');
    await flush();
    expect(controller.getState()).toMatchObject({ segmentIndex: 2, status: 'paused', sleep: null });
  });

  it('stops at the end of the section, and the timer can be turned off', async () => {
    const { controller, media } = setup();
    await controller.load(DOC, 1, true);
    controller.setSleepTimer('section');
    media.emit('ended');
    await flush();
    expect(controller.getState()).toMatchObject({ segmentIndex: 2, status: 'playing' });
    media.emit('ended');
    await flush();
    expect(controller.getState()).toMatchObject({ segmentIndex: 3, status: 'paused', sleep: null });
    controller.setSleepTimer(5);
    const { sleep } = controller.getState();
    expect(sleep?.kind === 'minutes' && sleep.endsAt > Date.now()).toBe(true); // the real clock
    controller.setSleepTimer(null);
    expect(controller.getState().sleep).toBeNull();
    controller.setSleepTimer('section');
    controller.unload();
    expect(controller.getState().sleep).toBeNull();
  });

  it('takes corrected sections only for the loaded document', async () => {
    const { controller } = setup();
    const moved: PlayerDocument = {
      ...DOC,
      sections: [
        { index: 0, title: 'One', startSegment: 0, segmentCount: 4 },
        { index: 1, title: 'Two', startSegment: 4, segmentCount: 2 },
      ],
    };
    controller.refresh(moved);
    expect(controller.getState().document).toBeNull();
    await controller.load(DOC, 0, false);
    controller.refresh({ ...moved, id: 'other' });
    expect(controller.sectionAt(3)?.title).toBe('Two');
    controller.refresh(moved);
    expect(controller.sectionAt(3)?.title).toBe('One');
  });

  it('mirrors pause, play and time updates from the media element', async () => {
    const { controller, media } = setup();
    await controller.load(DOC, 0, true);
    media.emit('pause');
    media.emit('pause');
    expect(controller.getState().status).toBe('paused');
    media.emit('play');
    media.emit('play');
    expect(controller.getState().status).toBe('playing');
    media.currentTime = 1.5;
    media.emit('timeupdate');
    expect(controller.getState().currentTime).toBe(1.5);
  });

  it('starts again from the beginning after the end', async () => {
    const { controller, media } = setup();
    await controller.load(DOC, 5, true);
    media.emit('ended');
    expect(controller.getState().status).toBe('ended');
    await controller.play();
    expect(controller.getState()).toMatchObject({ segmentIndex: 0, status: 'playing' });
  });

  it('pauses while the next sentence is still being generated', async () => {
    const { controller, deps, media } = setup();
    const pending: (() => void)[] = [];
    deps.fetchSegment = () =>
      new Promise((resolve) => {
        pending.push(() => resolve({ url: 'blob:late', duration: 1 }));
      });
    const loading = controller.load(DOC, 0, true);
    expect(controller.getState().status).toBe('loading');
    await controller.toggle();
    expect(controller.getState().status).toBe('paused');
    for (const release of pending) release();
    await loading;
    // The audio arriving after the pause must not start playback by itself…
    expect(media.play).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('paused');
    // …but it is kept, so Play starts it at once without fetching again.
    await controller.play();
    expect(media.src).toBe('blob:late');
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('playing');
  });

  it('stays within sections at the edges of the document', async () => {
    const { controller } = setup();
    await controller.load(DOC, 5, false);
    await controller.nextSection();
    expect(controller.getState().segmentIndex).toBe(5);
    await controller.previousSection();
    expect(controller.getState().segmentIndex).toBe(3);
    await controller.seek(0);
    await controller.previousSection();
    expect(controller.getState().segmentIndex).toBe(0);
    await controller.load({ ...DOC, id: 'flat', sections: [] }, 2, false);
    await controller.nextSection();
    await controller.previousSection();
    expect(controller.getState().segmentIndex).toBe(2);
    // Segments before the first listed section belong to no section at all.
    await controller.load({ ...DOC, id: 'tail', sections: DOC.sections.slice(1) }, 1, false);
    await controller.nextSection();
    expect(controller.getState().segmentIndex).toBe(1);
  });

  it('ignores aborted requests', async () => {
    const { controller, deps } = setup();
    deps.fetchSegment = () => Promise.reject(new DOMException('gone', 'AbortError'));
    await controller.load(DOC, 0, true);
    expect(controller.getState()).toMatchObject({ status: 'loading', error: null });
  });

  it('ignores late play() results from audio that was already skipped', async () => {
    const { controller, media } = setup();
    const settle = { resolve: () => undefined as void, reject: (_error: unknown) => undefined };
    const deferPlay = () =>
      media.play.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            Object.assign(settle, { resolve, reject });
          }),
      );
    deferPlay();
    const failed = controller.load(DOC, 0, true);
    await flush();
    await controller.next();
    settle.reject(new Error('interrupted'));
    await failed;
    expect(controller.getState()).toMatchObject({ segmentIndex: 1, status: 'playing' });
    deferPlay();
    const late = controller.seek(3);
    await flush();
    controller.pause();
    await controller.seek(4);
    settle.resolve();
    await late;
    expect(controller.getState()).toMatchObject({ segmentIndex: 4, status: 'paused' });
  });

  it('treats an interrupted play() as benign and other media failures as errors', async () => {
    const { controller, media } = setup();
    media.playError = new DOMException('replaced', 'AbortError');
    await controller.load(DOC, 0, true);
    expect(controller.getState().status).toBe('loading');
    media.playError = new DOMException('bad file', 'NotSupportedError');
    await controller.next();
    expect(controller.getState()).toMatchObject({ status: 'error', error: { code: 'test' } });
    media.playError = new Error('decoder crashed');
    await controller.play();
    expect(controller.getState().error?.message).toBe('Error: decoder crashed');
  });
});
