// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Shared set-up for the background-music engine tests.
 * Scope: Chunked tracks of 20 s chunks at 48 kHz with 20 ms edges, decoded chunks (optionally trimmed
 *   by a decoder), an engine on a fake Web Audio context with its fetches recorded, settling
 *   fetch and decode promises, where a source's music is heard, and ending a chunk early.
 * Does NOT belong: The tests themselves (features/music/engine*.test.ts).
 */
import { vi } from 'vitest';
import type { FakeSource } from '@/test/audio';
import { FakeAudioContext, fakeBuffer } from '@/test/audio';
import type { MusicTarget } from '@/features/music/engine';
import { MusicEngine } from '@/features/music/engine';

export const RATE = 48_000;
const EDGE = 960;

/** A track of `count` chunks of `seconds` each. */
export function track(id: string, count = 3, seconds = 20, resume = true): MusicTarget {
  return {
    id,
    resume,
    edgeFrames: EDGE,
    chunks: Array.from({ length: count }, (_, index) => ({
      url: `/music/${id}/${index + 1}.webm`,
      frames: seconds * RATE,
    })),
  };
}

export const A = track('a');
export const B = track('b');
export const C = track('c');

/** A decoded 20 s chunk with its two 20 ms edges, less `trimmed` seconds a decoder dropped. */
export const chunk = (trimmed = 0) => fakeBuffer(20.04 - trimmed);

export function setup(create?: () => FakeAudioContext) {
  const contexts: FakeAudioContext[] = [];
  const onLoading = vi.fn();
  const onError = vi.fn();
  const fetchTrack = vi.fn((url: string) => Promise.resolve(new TextEncoder().encode(url).buffer));
  const engine = new MusicEngine({
    onLoading,
    onError,
    fetchTrack,
    createContext: () => {
      const made = create?.();
      const context = made ?? new FakeAudioContext();
      if (!made) context.decode = () => Promise.resolve(chunk());
      contexts.push(context);
      return context;
    },
  });
  const context = () => contexts.at(-1) as FakeAudioContext;
  const fetched = () => fetchTrack.mock.calls.map(([url]) => url);
  return { engine, contexts, context, onLoading, onError, fetchTrack, fetched };
}

/** Let fetch and decode promises settle (microtasks only; timers are fake). */
export async function flush() {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

/** Where a source's music is heard from and to, on the context's clock. */
export function heard(source: FakeSource | undefined) {
  const started = source?.started;
  return {
    from: Number(started?.when),
    offset: Number(started?.offset),
    to: Number(started?.when) + Number(started?.duration),
  };
}

/** Let the chunk playing now finish, so the engine fetches the one after the next. */
export async function finishChunk(context: FakeAudioContext) {
  const playing = context.playing.at(0) as FakeSource;
  context.currentTime = heard(playing).to;
  playing.end();
  await flush();
}
