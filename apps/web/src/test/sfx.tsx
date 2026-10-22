// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Shared steps and fixtures for testing the Sounds panel inside the real reader and player.
 * Scope: The sample document and its sound-effects API path, an effect at a sentence (one-shot and
 *   ambience), the reader's API with an arrangement that tests can replace, opening the Sounds tab
 *   (or rendering the panel on its own), and starting narration with effects on so a one-shot's
 *   moment can be driven by hand.
 * Does NOT belong: Assertions, or Web Audio fakes (webAudio.ts).
 */
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { SfxEffect } from '@/api/types';
import { PlayerBar } from '@/features/player/PlayerBar';
import ReaderPage from '@/features/reader/ReaderPage';
import { effect } from '@/features/sfx/scheduler.test';
import { documentDetail, mockReaderApi, renderWithApp } from './render';

export const doc = documentDetail();
export const BASE = `/api/documents/${doc.id}/sound-effects`;
const READER = (
  <>
    <ReaderPage />
    <PlayerBar />
  </>
);

/** A one-shot on the second sentence of chapter one. */
export const thud = (overrides: Partial<SfxEffect> = {}) =>
  effect({ id: 'e1', segmentIndex: 1, sectionIndex: 0, text: 'Sentence 2.', ...overrides });

/** An ambience placed by hand over chapter two. */
export const rain = (overrides: Partial<SfxEffect> = {}) =>
  effect({
    id: 'e2',
    segmentIndex: 2,
    sectionIndex: 1,
    text: 'Sentence 3.',
    soundId: 'rain-light',
    untilSegment: 3,
    volume: 60,
    origin: 'manual',
    ...overrides,
  });

/** The reader's API with the given arrangement (replaceable with `set`) and sounds that load. */
export function soundsApi(effects: SfxEffect[] = [], overrides: Record<string, unknown> = {}) {
  let current = { effects, analyses: [] as unknown[] };
  const api = mockReaderApi(doc, {
    [`GET ${BASE}`]: () => current,
    'GET /sfx/': () => new Response(new Uint8Array([1, 2, 3])),
    ...overrides,
  });
  return { ...api, set: (next: SfxEffect[]) => (current = { effects: next, analyses: [] }) };
}

/** Opens the reader on the sample document and its Sounds tab; any other element renders on its own. */
export async function openSounds(element: ReactNode = READER) {
  const user = userEvent.setup();
  const view = renderWithApp(element, { path: '/read/:documentId', route: `/read/${doc.id}` });
  if (element !== READER) {
    await screen.findByRole('switch', { name: 'Sound effects' });
    const panel = view.container;
    const press = (name: string | RegExp) =>
      user.click(within(panel).getByRole('button', { name }));
    return { ...view, user, panel, press };
  }
  await screen.findByRole('region', { name: 'Audio player' });
  await user.click(await screen.findByRole('tab', { name: 'Sounds' }));
  const panel = await screen.findByRole('tabpanel');
  const press = (name: string | RegExp) => user.click(within(panel).getByRole('button', { name }));
  return { ...view, user, panel, press };
}

/** Turns effects on, presses Play, and moves the sentence's clip to `seconds` so a one-shot is due. */
export async function startNarration(
  user: UserEvent,
  panel: HTMLElement,
  media: { currentTime: number; emit: (type: string) => void },
  seconds = 0.1,
) {
  await user.click(within(panel).getByRole('switch', { name: 'Sound effects' }));
  const player = screen.getByRole('region', { name: 'Audio player' });
  await user.click(within(player).getByRole('button', { name: 'Play' }));
  await within(player).findByRole('button', { name: 'Pause' });
  act(() => {
    media.currentTime = seconds;
    media.emit('timeupdate');
  });
  return player;
}
