/**
 * Purpose: Behavioural tests for the PlaybackController state machine.
 * Scope: Loading without autoplay, playback with prefetch, auto-advance on `ended`, stale-request
 *   protection when skipping, section navigation, voice/pace changes, error and autoplay-block
 *   handling, and progress persistence — using a fake media element and fetcher.
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

function setup() {
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
