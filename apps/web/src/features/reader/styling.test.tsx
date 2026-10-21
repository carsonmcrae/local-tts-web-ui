// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for giving chosen sentences their own voice, effect or sound in the reader.
 * Scope: Styled sentences are marked and described; selecting text offers "Voice & effect", whose
 *   dialog sends the choices for the selected sentences, keeps what differs, and clears; the cast
 *   dialog chooses the dialogue voice, styles the sentence being read and clears everything; the
 *   pure selection helper finds the sentences a selection touches.
 * Does NOT belong: Reading, bookmarks or search (reader.test.tsx, search.test.tsx).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentStyles } from '@/api/types';
import { documentDetail, mockReaderApi, renderWithApp, voice } from '@/test/render';
import ReaderPage from './ReaderPage';
import { selectedSentences } from './SentenceStyling';

afterEach(() => vi.unstubAllGlobals());

const doc = documentDetail({ segmentCount: 4, sections: [] });
const styles = (overrides: Partial<DocumentStyles> = {}): DocumentStyles => ({
  segments: [],
  dialogueVoiceId: null,
  revision: 'r1',
  ...overrides,
});
const VOICES = [
  voice(),
  voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)' }),
  voice({ id: 'custom:sam', name: 'Sam', category: 'custom', engineId: 'chatterbox' }),
];

function openReader(initial: DocumentStyles = styles()) {
  const state = { styles: initial };
  const respond = (_url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    state.styles = { ...state.styles, revision: 'r2', ...('dialogueVoiceId' in body ? body : {}) };
    return state.styles;
  };
  const api = mockReaderApi(doc, {
    'GET /api/voices': VOICES,
    [`GET /api/documents/${doc.id}/styles`]: () => state.styles,
    [`PUT /api/documents/${doc.id}/styles`]: respond,
    [`PUT /api/documents/${doc.id}/cast`]: respond,
  });
  renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${doc.id}` });
  return api;
}

/** Selects the text from the start of one sentence to the end of another and announces it. */
function select(first: HTMLElement, last: HTMLElement) {
  const range = document.createRange();
  range.setStart(first.firstChild!, 0);
  range.setEnd(last.firstChild!, last.textContent.length);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

const sentence = (text: string) => screen.getByText(text, { selector: '.reader-seg' });

describe('Sentence styling', () => {
  it('marks and describes sentences that have their own voice or effect', async () => {
    openReader(
      styles({ segments: [{ index: 1, voiceId: 'kokoro:bm_george', effect: 'telephone' }] }),
    );
    const styled = await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    await waitFor(() => expect(styled).toHaveAttribute('data-styled', 'true'));
    await waitFor(() =>
      expect(styled).toHaveAccessibleDescription('Read by George · Telephone call'),
    );
    expect(sentence('Sentence 1.')).toHaveAttribute('data-styled', 'false');
  });

  it('styles the selected sentences from the floating button', async () => {
    const { calls } = openReader();
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    select(sentence('Sentence 2.'), sentence('Sentence 3.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voice and effect' });
    expect(within(dialog).getByText('How these 2 sentences should sound.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Voice'), 'kokoro:bm_george');
    await user.selectOptions(within(dialog).getByLabelText('Effect'), 'loudspeaker');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.find((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    expect(JSON.parse(String(sent?.body))).toEqual({
      indexes: [1, 2],
      voiceId: 'kokoro:bm_george',
      effect: 'loudspeaker',
      sound: null,
    });
  });

  it('keeps what differs between the selected sentences, and clears them', async () => {
    const { calls } = openReader(
      styles({
        segments: [
          { index: 0, effect: 'radio' },
          { index: 1, effect: 'robot', sound: 'sigh' },
        ],
      }),
    );
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    select(sentence('Sentence 1.'), sentence('Sentence 2.'));
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
      voiceId: null,
      sound: 'laugh',
    });

    select(sentence('Sentence 1.'), sentence('Sentence 1.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect' }));
    await user.click(await screen.findByRole('button', { name: 'Clear styling' }));
    await waitFor(() => expect(styled()).toHaveLength(2));
    expect(JSON.parse(String(styled()[1]?.body))).toEqual({
      indexes: [0],
      voiceId: null,
      effect: null,
      sound: null,
    });
  });

  it('chooses the dialogue voice and clears every styled sentence from the cast dialog', async () => {
    const { calls } = openReader(styles({ segments: [{ index: 3, effect: 'hall' }] }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Voices & effects' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voices and effects' });
    await user.selectOptions(within(dialog).getByLabelText('Dialogue voice'), 'custom:sam');
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/cast'))).toBe(true));
    const cast = calls.find((call) => call.path.endsWith('/cast'));
    expect(JSON.parse(String(cast?.body))).toEqual({ dialogueVoiceId: 'custom:sam' });
    expect(
      await within(dialog).findByText(/1 sentence has their own voice or effect/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/styles'))).toBe(true));
  });
});

describe('Selected sentences', () => {
  it('counts only the sentences a selection really touches', () => {
    document.body.innerHTML =
      '<div id="root"><span class="reader-seg" data-index="4">One.</span> <span class="reader-seg" data-index="5">Two.</span></div><p id="outside">Elsewhere</p>';
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
});
