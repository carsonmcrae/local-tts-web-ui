// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: More tests for the Sounds panel: its less-travelled states and every error it can show.
 * Scope: One suggestion previewed, replaced and jumped to; errors from accepting, adding, changing
 *   and removing; adjusting a one-shot placed at the end, cancelling, and a failed save; a sound
 *   the library lacks and a sound file that cannot load; the panel when the narration is on another
 *   document (effects go to the chapter's start); the loading state; two effects on one sentence;
 *   and the hook outside its provider.
 * Does NOT belong: The main flows (sfx.test.tsx) or rows and labels (EffectRows.test.tsx).
 */
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from '@/test/render';
import { BASE, doc, openSounds, soundsApi, startNarration, thud } from '@/test/sfx';
import { FakeAudioContext } from '@/test/audio';
import { useSfx } from './SfxProvider';
import { SoundPanel, latestError, placement } from './SoundPanel';

const failure = (message: string) => () => json({ error: { code: 'boom', message } }, 500);

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sounds panel, the rest', () => {
  it('previews a suggestion, replaces its sound, and jumps to its sentence', async () => {
    const suggestion = thud({
      status: 'suggested',
      segmentIndex: 2,
      sectionIndex: 1,
      text: 'Sentence 3.',
    });
    const api = soundsApi([suggestion], {
      [`POST ${BASE}/analyse`]: {
        effects: [suggestion],
        analyses: [],
        sectionIndex: 0,
        sentences: 2,
        suggested: 1,
        truncated: false,
      },
      [`PATCH ${BASE}/`]: () => json({}),
    });
    const { user, panel } = await openSounds();
    await user.click(within(panel).getByRole('button', { name: 'Analyse this chapter' }));
    expect(await within(panel).findByRole('status')).toHaveTextContent(
      '1 new suggestion for this chapter.',
    );
    const suggested = within(panel).getByRole('region', { name: 'Suggested' });
    await user.click(within(suggested).getByRole('button', { name: 'Preview A heavy thud' }));
    await user.click(
      within(suggested).getByRole('button', { name: 'Stop the preview of A heavy thud' }),
    );
    await user.click(
      within(suggested).getByRole('button', { name: 'Replace the sound for “Sentence 3.”' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Replace the sound' });
    expect(within(dialog).getByText('Pick another sound for this moment.')).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Use' })[2] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patched = api.calls.findLast((call) => call.method === 'PATCH');
    expect(JSON.parse(String(patched?.body))).toEqual({ soundId: 'rain-light' });
    await user.click(within(suggested).getByRole('button', { name: 'Sentence 3.' }));
    expect(await screen.findByText(/Section 2 of 2/)).toBeInTheDocument();
  });

  it('shows errors from accepting, adding, changing and removing', async () => {
    soundsApi(
      [thud({ status: 'suggested' }), thud({ id: 'e2', segmentIndex: 0, text: 'Chapter One' })],
      {
        [`POST ${BASE}/review`]: failure('Review failed.'),
        [`POST ${BASE}`]: failure('Adding failed.'),
        [`PATCH ${BASE}/`]: failure('Changing failed.'),
        [`DELETE ${BASE}/`]: failure('Removing failed.'),
      },
    );
    const { user, panel } = await openSounds();
    await user.click(
      within(panel).getByRole('button', { name: 'Accept the suggestion for “Sentence 2.”' }),
    );
    expect(await within(panel).findByText('Review failed.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Turn off “A heavy thud” here' }));
    expect(await within(panel).findByText('Changing failed.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Remove “A heavy thud”' }));
    expect(await within(panel).findByText('Removing failed.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Add an effect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    await user.click(within(dialog).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    expect(await within(panel).findByText('Adding failed.')).toBeInTheDocument();
  });

  it('adjusts a one-shot placed at the end, cancels, and reports a failed save', async () => {
    soundsApi([thud({ origin: 'manual', position: 1, offsetMs: -500 })], {
      [`PATCH ${BASE}/`]: failure('Saving failed.'),
    });
    const { user, panel } = await openSounds();
    await user.click(within(panel).getByRole('button', { name: 'Adjust “A heavy thud”' }));
    let dialog = await screen.findByRole('dialog', { name: 'Adjust “A heavy thud”' });
    expect(within(dialog).getByRole('radio', { name: 'As the sentence ends' })).toBeChecked();
    expect(within(dialog).getByRole('slider', { name: 'Delay' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(
      within(dialog).queryByRole('slider', { name: 'How many sentences it lasts' }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(panel).getByRole('button', { name: 'Adjust “A heavy thud”' }));
    await screen.findByRole('dialog', { name: 'Adjust “A heavy thud”' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(panel).getByRole('button', { name: 'Adjust “A heavy thud”' }));
    dialog = await screen.findByRole('dialog', { name: 'Adjust “A heavy thud”' });
    await user.click(within(dialog).getByRole('radio', { name: 'As the sentence starts' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Saving failed.')).toBeInTheDocument();
  });

  it('previews from a placed row and shows a one-sentence ambience in the singular', async () => {
    soundsApi([
      thud({ origin: 'manual' }),
      thud({
        id: 'e2',
        segmentIndex: 2,
        sectionIndex: 1,
        text: 'Sentence 3.',
        soundId: 'rain-light',
        untilSegment: 2,
      }),
    ]);
    const { user, panel } = await openSounds();
    const placed = within(panel).getByRole('region', { name: 'In this document' });
    await user.click(within(placed).getByRole('button', { name: 'Preview A heavy thud' }));
    await user.click(
      within(placed).getByRole('button', { name: 'Stop the preview of A heavy thud' }),
    );
    expect(within(placed).getByText('At the start · lasts 1 sentence')).toBeInTheDocument();
    await user.click(within(placed).getByRole('button', { name: 'Adjust “Light rain”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust “Light rain”' });
    expect(within(dialog).getByText('1 sentence')).toBeInTheDocument();
  });

  it('names a sound the library lacks by its id, and says when a sound file will not load', async () => {
    soundsApi(
      [
        thud({ soundId: 'ghost', segmentIndex: 0 }),
        thud({ id: 'e2', segmentIndex: 0, offsetMs: 100 }),
      ],
      {
        'GET /sfx/': () => json({}, 404),
      },
    );
    const { user, panel, media } = await openSounds();
    expect(within(panel).getByText('ghost')).toBeInTheDocument();
    await startNarration(user, panel, media, 0.2);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('couldn’t be played');
  });

  it('places a hand-added effect at the chapter start when the narration is elsewhere', async () => {
    const api = soundsApi([], {
      [`POST ${BASE}`]: (_url: URL, init: RequestInit) => json(JSON.parse(String(init.body)), 201),
    });
    const { user, panel } = await openSounds(
      <SoundPanel
        documentId={doc.id}
        sections={doc.sections}
        viewedSection={1}
        activeIndex={null}
        onJump={vi.fn()}
      />,
    );
    await user.click(within(panel).getByRole('button', { name: 'Add an effect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    expect(within(dialog).getByText(/at the start of this chapter/)).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const added = api.calls.findLast((call) => call.method === 'POST' && call.path === BASE);
    expect(JSON.parse(String(added?.body))).toMatchObject({ segmentIndex: 2, soundId: 'thud' });
    expect(placement([], 0, null)).toEqual({ target: 0, last: 0 });
    expect(placement(doc.sections, 1, 3)).toEqual({ target: 3, last: 3 });
    expect(latestError([{ isError: false, error: null, submittedAt: 1 }])).toBeUndefined();
  });

  it('shows a skeleton while the arrangement loads, and the hook needs its provider', async () => {
    soundsApi([], { [`GET ${BASE}`]: () => new Promise<Response>(() => undefined) });
    const { panel } = await openSounds();
    expect(panel.querySelector('.animate-pulse')).not.toBeNull();
    expect(() => renderHook(() => useSfx())).toThrow('useSfx must be used inside <SfxProvider>');
  });

  it('describes two effects on one sentence together', async () => {
    soundsApi([thud(), thud({ id: 'e2', soundId: 'door-knock' })]);
    await openSounds();
    await screen.findAllByRole('button', { name: 'Sentence 2.' });
    const sentence = document.querySelector('.reader-seg[data-index="1"]') as HTMLElement;
    expect(sentence).toHaveAccessibleName('Sentence 2.');
    expect(sentence).toHaveAccessibleDescription('Sound effect: A heavy thud, A knock at the door');
  });
});
