// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Sounds panel inside the real reader and player.
 * Scope: Off by default with a remembered volume and intensity; analysing a chapter on request and
 *   reviewing what it suggests (accept, dismiss, replace, accept all); adding an effect by hand at
 *   the sentence being read, adjusting, replacing, turning it off and removing it; the marker on
 *   the sentence and jumping to it; playback through a fake Web Audio context that fires an effect
 *   at its moment, cuts it on a pause and previews from the library; and every notice and error.
 * Does NOT belong: Engine, trigger or session rules in isolation (their own tests).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SfxEffect } from '@/api/types';
import { json, soundLibrary } from '@/test/render';
import { BASE, openSounds, rain, soundsApi, startNarration, thud } from '@/test/sfx';
import { FakeSfxContext } from '@/test/webAudio';

let contexts: FakeSfxContext[] = [];

beforeEach(() => {
  contexts = [];
  vi.stubGlobal(
    'AudioContext',
    class extends FakeSfxContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const body = (
  calls: { method: string; path: string; body: unknown }[],
  method: string,
  path: string,
) => JSON.parse(String(calls.findLast((c) => c.method === method && c.path === path)?.body));

describe('Sounds panel', () => {
  it('is off by default, remembers volume and intensity, and never remembers "on"', async () => {
    soundsApi();
    const { user, panel } = await openSounds();
    const toggle = within(panel).getByRole('switch', { name: 'Sound effects' });
    expect(toggle).not.toBeChecked();
    expect(within(panel).getByText(/Off at the start of every narration/)).toBeInTheDocument();
    expect(within(panel).getByText(/No sound effects yet/)).toBeInTheDocument();
    const slider = within(panel).getByRole('slider', { name: 'Sound effects volume' });
    expect(slider).toHaveAttribute('aria-valuenow', '40');
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '41');
    await user.click(within(panel).getByRole('radio', { name: 'Immersive' }));
    expect(JSON.parse(localStorage.getItem('ltts.sfx') ?? '{}')).toEqual({
      volume: 41,
      intensity: 'immersive',
    });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(within(panel).getByText('Playing with the narration.')).toBeInTheDocument();
    expect(localStorage.getItem('ltts.sfx')).not.toContain('enabled');
  });

  it('analyses the chapter on request and lists suggestions to review', async () => {
    const first = thud({ status: 'suggested' });
    const second = thud({
      id: 'e3',
      segmentIndex: 0,
      text: 'Chapter One',
      status: 'suggested',
      position: 0.5,
    });
    const statuses = new Map<string, SfxEffect['status']>();
    const api = soundsApi([], {
      [`POST ${BASE}/analyse`]: {
        effects: [second, first],
        analyses: [],
        sectionIndex: 0,
        sentences: 2,
        suggested: 2,
        truncated: true,
      },
      [`POST ${BASE}/review`]: (_url: URL, init: RequestInit) => {
        const asked = JSON.parse(String(init.body)) as { accept: string[]; dismiss: string[] };
        for (const id of asked.accept) statuses.set(id, 'accepted');
        for (const id of asked.dismiss) statuses.set(id, 'dismissed');
        return {
          effects: [second, first].map((item) => ({
            ...item,
            status: statuses.get(item.id) ?? item.status,
          })),
          analyses: [],
        };
      },
    });
    const { user, panel, press } = await openSounds();
    await press('Analyse this chapter');
    expect(body(api.calls, 'POST', `${BASE}/analyse`)).toEqual({
      sectionIndex: 0,
      intensity: 'balanced',
    });
    expect(await within(panel).findByRole('status')).toHaveTextContent(
      '2 new suggestions for this chapter. Only the first 2 sentences were analysed.',
    );
    const suggested = within(panel).getByRole('region', { name: 'Suggested' });
    console.log(
      'DEBUG-ITEMS',
      within(suggested)
        .getAllByRole('listitem')
        .map((e) => `${e.tagName}.${e.className.slice(0, 40)}|${e.getAttribute('role')}`)
        .join(' ;; '),
    );
    expect(within(suggested).getAllByRole('listitem')).toHaveLength(2);
    expect(within(suggested).getAllByText('A heavy thud')).toHaveLength(2);
    expect(within(suggested).getByText('Halfway')).toBeInTheDocument();
    expect(within(suggested).getAllByText('Suggested')).toHaveLength(3); // the heading and two badges
    await user.click(
      within(suggested).getByRole('button', { name: 'Dismiss the suggestion for “Chapter One”' }),
    );
    expect(body(api.calls, 'POST', `${BASE}/review`)).toEqual({ accept: [], dismiss: ['e3'] });
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1));
    await press('Accept the suggestion for “Sentence 2.”');
    expect(body(api.calls, 'POST', `${BASE}/review`)).toEqual({ accept: ['e1'], dismiss: [] });
    const placed = await within(panel).findByRole('region', { name: 'In this document' });
    expect(within(placed).getByText('Suggested')).toBeInTheDocument();
    expect(within(panel).queryByRole('region', { name: 'Suggested' })).not.toBeInTheDocument();
  });

  it('accepts every suggestion at once, as a secondary action', async () => {
    const api = soundsApi(
      [thud({ status: 'suggested' }), rain({ status: 'suggested', origin: 'suggested' })],
      {
        [`POST ${BASE}/review`]: { effects: [thud(), rain({ origin: 'suggested' })], analyses: [] },
      },
    );
    const { panel, press } = await openSounds();
    await within(panel).findByRole('region', { name: 'Suggested' });
    await press('Accept all');
    expect(body(api.calls, 'POST', `${BASE}/review`)).toEqual({
      accept: ['e1', 'e2'],
      dismiss: [],
    });
    expect(
      await within(panel).findByRole('region', { name: 'In this document' }),
    ).toBeInTheDocument();
  });

  it('adds an effect by hand at the sentence being read', async () => {
    const api = soundsApi([], {
      [`POST ${BASE}`]: (_url: URL, init: RequestInit) => {
        api.set([rain({ segmentIndex: 0, sectionIndex: 0, text: 'Chapter One', untilSegment: 1 })]);
        return json(JSON.parse(String(init.body)), 201);
      },
    });
    const { user, panel, press } = await openSounds();
    await press('Add an effect');
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    expect(within(dialog).getByText(/at the sentence being read/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Use' })).toHaveLength(3);
    await user.click(within(dialog).getByRole('radio', { name: 'Doors and buildings' }));
    expect(within(dialog).getAllByRole('button', { name: 'Use' })).toHaveLength(1);
    await user.click(within(dialog).getByRole('radio', { name: 'All' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search sounds' }), 'rain');
    expect(within(dialog).getByText('Light rain')).toBeInTheDocument();
    expect(within(dialog).getByText('Loops')).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('searchbox', { name: 'Search sounds' }));
    await user.type(
      within(dialog).getByRole('searchbox', { name: 'Search sounds' }),
      'nothing like this',
    );
    expect(within(dialog).getByText('No sounds match that search.')).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('searchbox', { name: 'Search sounds' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search sounds' }), 'light rain');
    await user.click(within(dialog).getByRole('button', { name: 'Use' }));
    expect(body(api.calls, 'POST', BASE)).toEqual({
      segmentIndex: 0,
      soundId: 'rain-light',
      position: 0,
      offsetMs: 0,
      untilSegment: 1,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const placed = await within(panel).findByRole('region', { name: 'In this document' });
    expect(within(placed).getByText('Added by you')).toBeInTheDocument();
    expect(within(placed).getByText('At the start · lasts 2 sentences')).toBeInTheDocument();
  });

  it('turns a placed effect off, adjusts, replaces and removes it', async () => {
    const api = soundsApi(
      [rain({ segmentIndex: 0, sectionIndex: 0, text: 'Chapter One', untilSegment: 1 })],
      {
        [`PATCH ${BASE}/`]: (url: URL) => json({ id: url.pathname.split('/').pop() }),
        [`DELETE ${BASE}/`]: () => {
          api.set([]);
          return new Response(null, { status: 204 });
        },
      },
    );
    const { user, panel } = await openSounds();
    const placed = await within(panel).findByRole('region', { name: 'In this document' });
    await user.click(within(placed).getByRole('button', { name: 'Turn off “Light rain” here' }));
    expect(body(api.calls, 'PATCH', `${BASE}/e2`)).toEqual({ enabled: false });

    await user.click(within(placed).getByRole('button', { name: 'Adjust “Light rain”' }));
    const adjust = await screen.findByRole('dialog', { name: 'Adjust “Light rain”' });
    await user.click(within(adjust).getByRole('radio', { name: 'As the sentence ends' }));
    const delay = within(adjust).getByRole('slider', { name: 'Delay' });
    act(() => delay.focus());
    await user.keyboard('{ArrowRight}');
    const lasts = within(adjust).getByRole('slider', { name: 'How many sentences it lasts' });
    act(() => lasts.focus());
    await user.keyboard('{ArrowRight}');
    await user.click(within(adjust).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body(api.calls, 'PATCH', `${BASE}/e2`)).toEqual({
      position: 1,
      offsetMs: 100,
      volume: 60,
      untilSegment: 2,
    });

    await user.click(within(placed).getByRole('button', { name: 'Replace “Light rain”' }));
    const replace = await screen.findByRole('dialog', { name: 'Replace the sound' });
    await user.click(within(replace).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body(api.calls, 'PATCH', `${BASE}/e2`)).toEqual({ soundId: 'thud' });

    await user.click(within(placed).getByRole('button', { name: 'Remove “Light rain”' }));
    await waitFor(() =>
      expect(within(panel).getByText(/No sound effects yet/)).toBeInTheDocument(),
    );
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === `${BASE}/e2`)).toBe(true);
  });

  it('marks the sentence in the text, says when the text changed, and jumps to it', async () => {
    soundsApi([thud(), rain({ stale: true })]);
    const { user, panel } = await openSounds();
    await screen.findAllByRole('button', { name: 'Sentence 2.' });
    const sentence = document.querySelector('.reader-seg[data-index="1"]') as HTMLElement;
    expect(sentence).toHaveAttribute('data-effect', 'true');
    expect(sentence).toHaveAccessibleDescription('Sound effect: A heavy thud');
    const placed = within(panel).getByRole('region', { name: 'In this document' });
    expect(within(placed).getByText(/The text here changed/)).toBeInTheDocument();
    await user.click(within(placed).getByRole('button', { name: 'Sentence 3.' }));
    expect(await screen.findByText(/Section 2 of 2/)).toBeInTheDocument();
  });

  it('plays an effect at its moment, cuts it on a pause, and previews from the library', async () => {
    soundsApi([
      thud({ segmentIndex: 0 }),
      rain({ segmentIndex: 0, sectionIndex: 0, untilSegment: 1 }),
    ]);
    const { user, panel, media, press } = await openSounds();
    const player = await startNarration(user, panel, media);
    await waitFor(() => expect(contexts[0]?.playing).toHaveLength(2)); // the thud and the rain
    expect(contexts[0]?.playing.map((source) => source.loop).sort()).toEqual([false, true]);
    await user.click(within(player).getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(contexts[0]?.playing).toHaveLength(0));
    await press('Add an effect');
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    await user.click(within(dialog).getByRole('button', { name: 'Preview A heavy thud' }));
    await waitFor(() => expect(contexts[0]?.playing).toHaveLength(1));
    await user.click(
      within(dialog).getByRole('button', { name: 'Stop the preview of A heavy thud' }),
    );
    await waitFor(() => expect(contexts[0]?.playing).toHaveLength(0));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says when a sound cannot play, and when this browser has no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    soundsApi([thud({ segmentIndex: 0 })]);
    const { user, panel, media } = await openSounds();
    await startNarration(user, panel, media);
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Sound effects aren’t available in this browser.',
    );
    expect(within(panel).getByRole('switch', { name: 'Sound effects' })).not.toBeChecked();
  });

  it('shows errors from the arrangement, the library and analysis', async () => {
    soundsApi([], {
      [`GET ${BASE}`]: () =>
        json({ error: { code: 'boom', message: 'The arrangement is lost.' } }, 500),
      'GET /api/sound-effects/library': () =>
        json({ error: { code: 'boom', message: 'No library.' } }, 500),
      [`POST ${BASE}/analyse`]: () =>
        json({ error: { code: 'boom', message: 'Analysis failed.' } }, 500),
    });
    const { panel, press } = await openSounds();
    expect(await within(panel).findByText('The arrangement is lost.')).toBeInTheDocument();
    await press('Analyse this chapter');
    expect(await within(panel).findByText('Analysis failed.')).toBeInTheDocument();
    await press('Add an effect');
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    expect(await within(dialog).findByText('No library.')).toBeInTheDocument();
  });

  it('reports a quiet chapter and the number of sounds in the library', async () => {
    soundsApi([], {
      [`POST ${BASE}/analyse`]: {
        effects: [],
        analyses: [],
        sectionIndex: 0,
        sentences: 2,
        suggested: 0,
        truncated: false,
      },
    });
    const { panel, press } = await openSounds();
    await press('Analyse this chapter');
    expect(await within(panel).findByRole('status')).toHaveTextContent(
      'Nothing worth adding in this chapter.',
    );
    expect(soundLibrary.sounds).toHaveLength(3);
  });
});
