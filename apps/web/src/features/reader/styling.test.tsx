// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for giving chosen sentences their own voice, effect or sound in the reader.
 * Scope: Styled sentences are marked and described; selecting text offers "Voice & effect" (floating
 *   beside the selection), whose dialog sends the choices for the selected sentences, keeps what
 *   differs, clears choices one by one or all at once, asks for takes in the chosen voice, marks the
 *   kept take and reports refusals; "Sound effect" places a picked sound at the first selected
 *   sentence (a loop across all of them) and reports a refusal; a click on selected text doesn't
 *   start playback; the pure selection helper finds the sentences a selection touches.
 * Does NOT belong: The cast dialog (cast.test.tsx), reading, bookmarks or search (reader.test.tsx,
 *   search.test.tsx).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockReaderApi, renderWithApp } from '@/test/render';
import {
  openStyledReader,
  refused,
  selectSentences,
  sentence,
  styledDoc as doc,
  styles,
} from '@/test/styledReader';
import { selectedSentences, SelectionStyler } from './SentenceStyling';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect'); // jsdom has none; one test adds it
});

const takeOf = (take: number) => ({ take, audioUrl: `/api/audio/${String(take).repeat(64)}`, durationS: 2 }); // prettier-ignore

describe('Sentence styling', () => {
  it('marks and describes sentences that have their own voice or effect', async () => {
    openStyledReader(
      styles({
        segments: [
          { index: 1, voiceId: 'kokoro:bm_george', effect: 'telephone' },
          // A voice that is gone, a speaking style, a pause and a take.
          { index: 2, voiceId: 'custom:gone', style: 'calm', pauseMs: 1500, take: 1 },
        ],
      }),
    );
    const styled = await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    await waitFor(() => expect(styled).toHaveAttribute('data-styled', 'true'));
    await waitFor(() =>
      expect(styled).toHaveAccessibleDescription('Read by George · Telephone call'),
    );
    expect(sentence('Sentence 3.')).toHaveAccessibleDescription(
      'Read by another voice · Calm style · 1.5 s pause after · take 2',
    );
    expect(sentence('Sentence 1.')).toHaveAttribute('data-styled', 'false');
  });

  it('floats beside the selection, even one whose text cannot be read', async () => {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 300, left: 500, width: 100 }) as DOMRect,
    });
    vi.spyOn(Selection.prototype, 'toString').mockReturnValue(undefined as unknown as string);
    openStyledReader();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    selectSentences(sentence('Sentence 2.'), sentence('Sentence 2.'));
    const button = await screen.findByRole('button', { name: 'Voice & effect' });
    expect(button.parentElement).toHaveStyle({ top: '252px', left: '550px' });
    expect(screen.queryByRole('button', { name: 'Fix pronunciation' })).not.toBeInTheDocument();
  });

  it('does not start playback from a click on selected text', async () => {
    const { media } = openStyledReader();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    selectSentences(sentence('Sentence 2.'), sentence('Sentence 3.'));
    fireEvent.click(sentence('Sentence 2.'));
    expect(media.play).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Voice & effect (2)' })).toBeInTheDocument();
  });

  it('styles the selected sentences from the floating button', async () => {
    const { calls } = openStyledReader();
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    selectSentences(sentence('Sentence 2.'), sentence('Sentence 3.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voice and effect' });
    expect(
      within(dialog).getByText(
        /^How these 2 sentences should sound\. A voice or effect covers whole sentences/,
      ),
    ).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Voice'), 'kokoro:bm_george');
    await user.selectOptions(within(dialog).getByLabelText('Effect'), 'loudspeaker');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.find((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    expect(JSON.parse(String(sent?.body))).toEqual({
      indexes: [1, 2],
      voiceId: 'kokoro:bm_george',
      effect: 'loudspeaker',
    }); // only what was changed
  });

  it('keeps what differs between the selected sentences, and clears them', async () => {
    const { calls } = openStyledReader(
      styles({
        segments: [
          { index: 0, effect: 'radio' },
          { index: 1, effect: 'robot', sound: 'sigh' },
        ],
      }),
    );
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    selectSentences(sentence('Sentence 1.'), sentence('Sentence 2.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voice and effect' });
    expect(within(dialog).getByLabelText('Effect')).toHaveValue('__keep__');
    await user.selectOptions(within(dialog).getByLabelText('Sound before it'), 'laugh');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    const styled = () =>
      calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    await waitFor(() => expect(styled()).toHaveLength(1));
    const sent = styled()[0];
    expect(JSON.parse(String(sent?.body))).toEqual({
      indexes: [0, 1],
      sound: 'laugh',
    });

    selectSentences(sentence('Sentence 1.'), sentence('Sentence 1.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect' }));
    await user.click(await screen.findByRole('button', { name: 'Clear styling' }));
    await waitFor(() => expect(styled()).toHaveLength(2));
    expect(JSON.parse(String(styled()[1]?.body))).toEqual({
      indexes: [0],
      voiceId: null,
      effect: null,
      sound: null,
      style: null,
      pauseMs: null,
      take: null,
    });
  });
});

/** Selects "Sentence 2.", opens its styling dialog and its More options. */
async function moreOptionsForSentence2() {
  const user = userEvent.setup();
  await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
  selectSentences(sentence('Sentence 2.'), sentence('Sentence 2.'));
  await user.click(await screen.findByRole('button', { name: 'Voice & effect' }));
  const dialog = await screen.findByRole('dialog', { name: 'Voice and effect' });
  await user.click(within(dialog).getByText('More options'));
  return { user, dialog };
}

describe('A sound effect for the selection', () => {
  const EFFECTS = `/api/documents/${doc.id}/sound-effects`;
  /** Selects sentences 2 to `last`, opens the sound library from the floating button and picks `name`. */
  async function pickSound(last: string, name: string, extra: Record<string, unknown> = {}) {
    const api = openStyledReader(styles(), {
      [`POST ${EFFECTS}`]: () => ({}),
      ...extra,
    });
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    selectSentences(sentence('Sentence 2.'), sentence(last));
    await user.click(await screen.findByRole('button', { name: 'Sound effect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a sound effect' });
    const row = (await within(dialog).findByText(name)).closest('li') as HTMLElement;
    // What the library said before the pick: a placed sound closes it.
    const said = dialog.textContent;
    await user.click(within(row).getByRole('button', { name: 'Use' }));
    return { ...api, dialog, said };
  }
  const placed = (calls: { method: string; path: string; body?: unknown }[]) =>
    JSON.parse(String(calls.find((call) => call.method === 'POST' && call.path === EFFECTS)?.body));

  it('places a one-off sound at the first selected sentence', async () => {
    const { calls, said } = await pickSound('Sentence 3.', 'A heavy thud');
    expect(said).toMatch(/at the start of the first selected sentence.*in the audio mixer/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(placed(calls)).toEqual({
      segmentIndex: 1,
      soundId: 'thud',
      position: 0,
      offsetMs: 0,
      untilSegment: null,
    });
  });

  it('lets a looping sound play across the whole selection', async () => {
    const { calls } = await pickSound('Sentence 4.', 'Light rain');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(placed(calls)).toMatchObject({
      segmentIndex: 1,
      soundId: 'rain-light',
      untilSegment: 3,
    });
  });

  it('keeps the library open and says why a sound could not be placed', async () => {
    const { dialog, said } = await pickSound('Sentence 2.', 'A heavy thud', {
      [`POST ${EFFECTS}`]: refused('This document is being exported.'),
    });
    expect(said).toMatch(/at the start of this sentence/);
    expect(await within(dialog).findByText('This document is being exported.')).toBeInTheDocument();
  });
});

describe('More ways to shape a sentence', () => {
  it('sets a speaking style and a pause under More options', async () => {
    const { calls } = openStyledReader();
    const { user, dialog } = await moreOptionsForSentence2();
    await user.selectOptions(within(dialog).getByLabelText('Speaking style'), 'calm');
    await user.selectOptions(within(dialog).getByLabelText('Pause after it'), '2000');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/styles') && call.method === 'PUT')).toBe(
        true,
      ),
    );
    const sent = calls.find((call) => call.path.endsWith('/styles') && call.method === 'PUT');
    expect(JSON.parse(String(sent?.body))).toEqual({ indexes: [1], style: 'calm', pauseMs: 2000 });
  });

  it('tries another take of one sentence, keeps it, and goes back', async () => {
    const takes = [takeOf(1), takeOf(2)];
    const { calls } = openStyledReader(styles({ segments: [{ index: 1, take: 1 }] }), {
      [`POST /api/documents/${doc.id}/segments/1/takes`]: () => takes.pop(),
    });
    const { user, dialog } = await moreOptionsForSentence2();
    expect(within(dialog).getByText(/Playing take 2/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Try another take' }));
    expect(await within(dialog).findByText('Take 3')).toBeInTheDocument();
    const asked = calls.find((call) => call.path.endsWith('/takes'));
    expect(JSON.parse(String(asked?.body))).toEqual({ voiceId: 'kokoro:af_heart', take: 2 });
    await user.click(within(dialog).getByRole('button', { name: 'Listen' }));
    await user.click(within(dialog).getByRole('button', { name: 'Keep this take' }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/styles')),
      ).toHaveLength(1),
    );
    const kept = calls.find((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    expect(JSON.parse(String(kept?.body))).toEqual({ indexes: [1], take: 2 });
    await user.click(within(dialog).getByRole('button', { name: 'Back to the first take' }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/styles')),
      ).toHaveLength(2),
    );
  });

  it('explains that built-in voices always read a sentence the same way', async () => {
    openStyledReader(styles(), {
      [`POST /api/documents/${doc.id}/segments/1/takes`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'take_not_supported',
              message: 'Built-in voices read a sentence the same way every time.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const { user, dialog } = await moreOptionsForSentence2();
    await user.click(within(dialog).getByRole('button', { name: 'Try another take' }));
    expect(await within(dialog).findByText(/same way every time/)).toBeInTheDocument();
  });

  it('clears an effect and a pause, asks for takes in the chosen voice, and reports a refusal', async () => {
    const { calls } = openStyledReader(styles({ segments: [{ index: 1, effect: 'radio', pauseMs: 2000 }] }), {
      [`PUT /api/documents/${doc.id}/styles`]: refused('Styling is locked.'),
      [`POST /api/documents/${doc.id}/segments/1/takes`]: takeOf(1),
    });
    const { user, dialog } = await moreOptionsForSentence2();
    await user.selectOptions(within(dialog).getByLabelText('Effect'), 'No effect');
    await user.selectOptions(within(dialog).getByLabelText('Pause after it'), 'The usual pause');
    await user.selectOptions(within(dialog).getByLabelText('Voice'), 'kokoro:bm_george');
    await user.click(within(dialog).getByRole('button', { name: 'Try another take' }));
    expect(await within(dialog).findByText('Take 2')).toBeInTheDocument();
    const asked = calls.find((call) => call.path.endsWith('/takes'));
    expect(JSON.parse(String(asked?.body))).toEqual({ voiceId: 'kokoro:bm_george', take: 1 });
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Styling is locked.');
    const sent = calls.find((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    expect(JSON.parse(String(sent?.body))).toEqual({ indexes: [1], voiceId: 'kokoro:bm_george', effect: null, pauseMs: null }); // prettier-ignore
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }); // prettier-ignore

  it('marks the take that is kept', async () => {
    openStyledReader(styles({ segments: [{ index: 1, take: 1 }] }), {
      [`PUT /api/documents/${doc.id}/styles`]: (_url: URL, init: RequestInit) => {
        const { take } = JSON.parse(String(init.body)) as { take: number };
        return styles({ segments: [{ index: 1, take }], revision: 'r2' });
      },
      [`POST /api/documents/${doc.id}/segments/1/takes`]: takeOf(2),
    });
    const { user, dialog } = await moreOptionsForSentence2();
    await user.click(within(dialog).getByRole('button', { name: 'Try another take' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Keep this take' }));
    expect(await within(dialog).findByRole('button', { name: 'Kept' })).toBeDisabled();
    expect(within(dialog).getByText(/Playing take 3\./)).toBeInTheDocument();
  });

  it('explains a take or a keep the server refuses', async () => {
    openStyledReader(styles({ segments: [{ index: 1, take: 1 }] }), {
      [`POST /api/documents/${doc.id}/segments/1/takes`]: refused('The voice is busy.'),
      [`PUT /api/documents/${doc.id}/styles`]: refused('Styling is locked.'),
    });
    const { user, dialog } = await moreOptionsForSentence2();
    await user.click(within(dialog).getByRole('button', { name: 'Try another take' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The voice is busy.');
    await user.click(within(dialog).getByRole('button', { name: 'Back to the first take' }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert')).toHaveLength(2));
    expect(within(dialog).getAllByRole('alert')[1]).toHaveTextContent('Styling is locked.');
  });
});

describe('Selected sentences', () => {
  it('counts only the sentences a selection really touches', () => {
    document.body.innerHTML =
      '<div id="root"><span class="reader-seg" data-index="4">One.</span> <span class="reader-seg" data-index="5">Two.</span><span class="reader-seg" data-index="6"></span></div><p id="outside">Elsewhere</p>';
    const root = document.getElementById('root')!;
    const [one, two] = [...root.querySelectorAll('.reader-seg')] as HTMLElement[];
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(one!.firstChild!, 1);
    range.setEnd(two!.firstChild!, 0); // ends exactly where "Two." starts
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectedSentences(root)).toEqual([4]);
    range.setEnd(two!.firstChild!, 2);
    expect(selectedSentences(root)).toEqual([4, 5]);
    range.selectNodeContents(document.getElementById('outside')!);
    expect(selectedSentences(root)).toEqual([]);
    selection.removeAllRanges();
    expect(selectedSentences(root)).toEqual([]);
    fireEvent.click(root); // nothing to style: no errors
  });

  it('offers nothing while there is no text to select in', () => {
    mockReaderApi(doc);
    renderWithApp(
      <SelectionStyler
        documentId={doc.id}
        root={{ current: null }}
        styles={new Map()}
        voiceId="kokoro:af_heart"
        onChanged={vi.fn()}
      />,
    );
    document.getSelection()?.selectAllChildren(document.body);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(screen.queryByRole('button', { name: /Voice & effect/ })).not.toBeInTheDocument();
  });
});
