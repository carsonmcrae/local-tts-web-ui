// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for how the playback controller reads its audio element's pause and volume.
 * Scope: A sentence that plays to its end is not a pause (browsers fire 'pause' just before 'ended'),
 *   a real pause still is, and the narration volume is applied and kept within 0–1. Uses an
 *   EventTarget-based element that fires events the way browsers do.
 * Does NOT belong: The rest of the state machine (controller.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PlayerDocument } from './controller';
import { PlaybackController } from './controller';

/** An audio element that finishes sentences like a browser: 'pause' (with `ended` set), then 'ended'. */
class BrowserLikeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  ended = false;
  play = vi.fn(() => {
    this.ended = false;
    return Promise.resolve();
  });
  pause = vi.fn();
  finishSentence() {
    this.ended = true;
    this.dispatchEvent(new Event('pause'));
    this.dispatchEvent(new Event('ended'));
  }
}

const BOOK: PlayerDocument = {
  id: 'book',
  title: 'Book',
  segmentCount: 4,
  estimatedSeconds: 20,
  sections: [{ index: 0, title: 'One', startSegment: 0, segmentCount: 4 }],
};

function start() {
  const audio = new BrowserLikeAudio();
  const controller = new PlaybackController(
    {
      media: audio,
      fetchSegment: (_doc, index) => Promise.resolve({ url: `/audio/${index}`, duration: 5 }),
      saveProgress: vi.fn(),
      toError: () => ({ code: 'x', message: 'x' }),
    },
    { voiceId: 'kokoro:af_heart', rate: 1, pace: 1 },
  );
  const statuses: string[] = [];
  controller.subscribe((state) => statuses.push(state.status));
  return { audio, controller, statuses };
}

describe('PlaybackController and its audio element', () => {
  it('moves to the next sentence without ever reporting a pause', async () => {
    const { audio, controller, statuses } = start();
    await controller.load(BOOK, 0, true);
    statuses.length = 0;
    audio.finishSentence();
    await vi.waitFor(() => expect(controller.getState().segmentIndex).toBe(1));
    await vi.waitFor(() => expect(controller.getState().status).toBe('playing'));
    expect(statuses).not.toContain('paused');
  });

  it('still reports a pause in the middle of a sentence', async () => {
    const { audio, controller } = start();
    await controller.load(BOOK, 0, true);
    audio.dispatchEvent(new Event('pause')); // headphones unplugged, another app took the audio
    expect(controller.getState().status).toBe('paused');
  });

  it('sets the narration volume, kept between 0 and 1', () => {
    const { audio, controller } = start();
    controller.setVolume(0.85);
    expect(audio.volume).toBe(0.85);
    controller.setVolume(3);
    expect(audio.volume).toBe(1);
    controller.setVolume(-1);
    expect(audio.volume).toBe(0);
  });
});
