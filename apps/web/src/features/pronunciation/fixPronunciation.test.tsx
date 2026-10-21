// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for fixing a word's pronunciation from the reader.
 * Scope: Selecting a word offers "Fix pronunciation" (a long selection doesn't); the dialog starts in
 *   "Say it as", compares the word and the respelling in the reading voice, saves for this document
 *   by default, returns focus to the sentence and leaves the text as written; a word already saved
 *   starts from its pronunciation and, saved for all documents, folds this document's own into it;
 *   Escape closes without saving.
 * Does NOT belong: Settings → Pronunciation (pronunciation.test.tsx) or sentence styling
 *   (reader/styling.test.tsx).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pronunciation } from '@/api/types';
import ReaderPage from '@/features/reader/ReaderPage';
import { documentDetail, mockReaderApi, renderWithApp } from '@/test/render';
import { dictionaryRoutes, rule, sent } from './dictionaryTestApi';

afterEach(() => vi.unstubAllGlobals());

const doc = documentDetail({ segmentCount: 2, sections: [] });
const TEXTS = ['Dr. Nguyen ate gnocchi.', 'Then all of them shared a big bowl of warm quinoa.'];

function openReader(rules: Pronunciation[] = []) {
  const state = { rules };
  const api = mockReaderApi(doc, {
    [`GET /api/documents/${doc.id}/sections/`]: {
      sectionIndex: 0,
      segments: TEXTS.map((text, index) => ({
        index,
        sectionIndex: 0,
        paragraphIndex: 0,
        kind: 'paragraph',
        boundary: 'sentence',
        text,
      })),
    },
    [`GET /api/documents/${doc.id}/styles`]: {
      segments: [],
      dialogueVoiceId: null,
      splitDialogue: true,
      revision: 'r1',
    },
    ...dictionaryRoutes(state),
  });
  renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${doc.id}` });
  return { ...api, state };
}

const sentence = (text: string) => screen.findByText(text, { selector: '.reader-seg' });

/** Selects ``part`` of a sentence's text, as a reader dragging across a word would. */
async function select(text: string, part: string) {
  const node = (await sentence(text)).firstChild!;
  const start = text.indexOf(part);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + part.length);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

async function fix(text: string, part: string) {
  await select(text, part);
  await userEvent.click(await screen.findByRole('button', { name: 'Fix pronunciation' }));
  return screen.findByRole('dialog', { name: 'Fix pronunciation' });
}

describe('Fix pronunciation from the reader', () => {
  it('fixes a selected word for this document, heard both ways first', async () => {
    const { calls } = openReader();
    const user = userEvent.setup();
    const dialog = await fix(TEXTS[0]!, 'Nguyen');
    expect(within(dialog).getByText(/How the voice should say “Nguyen”/)).toBeVisible();
    const sayAs = within(dialog).getByLabelText('Say it as');
    await waitFor(() => expect(sayAs).toHaveFocus());
    expect(within(dialog).getByLabelText('Word or name')).toHaveValue('Nguyen');
    expect(within(dialog).getByRole('radio', { name: 'This document' })).toBeChecked();
    await user.type(sayAs, 'Win');
    await user.click(within(dialog).getByRole('button', { name: 'Hear as written' }));
    await user.click(within(dialog).getByRole('button', { name: 'Hear respelling' }));
    await waitFor(() =>
      expect(sent(calls, 'POST', '/api/pronunciation-preview')).toEqual([
        { voiceId: 'kokoro:af_heart', text: 'Nguyen', respelling: false, pace: 1 },
        { voiceId: 'kokoro:af_heart', text: 'Win', respelling: true, pace: 1 },
      ]),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(calls, 'POST', '/api/pronunciations')).toEqual([
      { word: 'Nguyen', sayAs: 'Win', matchCase: false, documentId: doc.id },
    ]);
    const read = await sentence(TEXTS[0]!); // the text itself never changes
    await waitFor(() => expect(read).toHaveFocus());
  });

  it('starts from the saved pronunciation and can fold it into all documents', async () => {
    const own = rule('gnocchi', 'NYOH-kee', { documentId: doc.id });
    const library = rule('gnocchi', 'NOK-ee');
    const { calls, state } = openReader([library, own]);
    const user = userEvent.setup();
    const dialog = await fix(TEXTS[0]!, 'gnocchi.');
    expect(within(dialog).getByLabelText('Word or name')).toHaveValue('gnocchi');
    expect(within(dialog).getByLabelText('Say it as')).toHaveValue('NYOH-kee'); // this document's wins
    expect(within(dialog).getByText('This document already says it as “NYOH-kee”.')).toBeVisible();
    await user.click(within(dialog).getByRole('radio', { name: 'All documents' }));
    expect(within(dialog).getByText(/This document's own “NYOH-kee” is replaced/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent(calls, 'PUT', `/api/pronunciations/${library.id}`)).toEqual([
      { word: 'gnocchi', sayAs: 'NYOH-kee', matchCase: false, documentId: null },
    ]);
    expect(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(own.id))).toBe(true);
    expect(state.rules).toEqual([{ ...library, sayAs: 'NYOH-kee' }]);
  });

  it('offers it only for a word or short phrase, and Escape closes without saving', async () => {
    const { calls } = openReader([rule('quinoa', 'KEEN-wah')]);
    const user = userEvent.setup();
    await select(TEXTS[1]!, TEXTS[1]!);
    expect(await screen.findByRole('button', { name: 'Voice & effect' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix pronunciation' })).not.toBeInTheDocument();

    const dialog = await fix(TEXTS[1]!, 'quinoa');
    expect(within(dialog).getByRole('radio', { name: 'All documents' })).toBeChecked();
    expect(within(dialog).getByText('All documents already say it as “KEEN-wah”.')).toBeVisible();
    await user.click(within(dialog).getByRole('radio', { name: 'This document' }));
    expect(within(dialog).getByText(/this document will say it your way/)).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/api/pronunciations')),
    ).toEqual([]);
  });
});
