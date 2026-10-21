// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for skipped sentences and the automatic cleanup in the reader.
 * Scope: Skipped sentences stay in the text, muted and labelled (in their accessible name too), and
 *   are never played; the styling dialog skips a sentence and reads a skipped one again; the cleanup
 *   note takes the place of its import warning, lists what is skipped by reason, shows a sentence
 *   in the text, and undoes and applies the cleanup again; nothing shows when nothing was found. The
 *   listening estimate is what the server counts, and is counted again after an undo, apply or skip.
 * Does NOT belong: Voices and effects (styling.test.tsx) or the player itself (controller.test.ts).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CleanupItem } from '@/api/cleanupQueries';
import { useCleanupAction } from '@/api/cleanupQueries';
import { keys } from '@/api/queries';
import { useStyleSentences } from '@/api/stylingQueries';
import { createQueryClient } from '@/app/App';
import { documentDetail, mockApi, mockReaderApi, renderWithApp } from '@/test/render';
import ReaderPage from './ReaderPage';

afterEach(() => vi.unstubAllGlobals());

const NOTICE = 'Skipped 1 running header, and 1 footnote marker when reading aloud.';
const OTHER = '2 of 9 pages had no readable text.';
const doc = documentDetail({ segmentCount: 4, sections: [], warnings: [OTHER, NOTICE] });
const MARKER = '¹';

/** A reader over a small fake server: sentence 1 is a header the cleanup skips, sentence 3 has a footnote. */
function openReader({ found = true } = {}) {
  const auto: Record<number, string> = found ? { 0: 'header' } : {};
  const state = { skipped: { ...auto } as Record<number, string>, footnotes: found };
  const styles = () => ({
    segments: Object.entries(state.skipped).map(([index, skip]) => ({
      index: Number(index),
      skip,
    })),
    dialogueVoiceId: null,
    splitDialogue: true,
    revision: JSON.stringify(state.skipped),
  });
  const item = (index: number, reason: CleanupItem['reason'], applied: boolean): CleanupItem => ({
    index,
    sectionIndex: 0,
    reason,
    text: `Sentence ${(index + 1).toString()}.`,
    markers: reason === 'footnote' ? [MARKER] : [],
    applied,
  });
  const report = () => ({
    notice: found ? NOTICE : null,
    items: [
      ...(found
        ? [item(0, 'header', 0 in state.skipped), item(2, 'footnote', state.footnotes)]
        : []),
      ...Object.entries(state.skipped)
        .filter(([, skip]) => skip === 'manual')
        .map(([index]) => item(Number(index), 'manual', true)),
    ],
  });
  const cleanup = (apply: boolean) => () => {
    const manual = Object.entries(state.skipped).filter(([, skip]) => skip === 'manual');
    state.skipped = { ...(apply ? auto : {}), ...Object.fromEntries(manual) };
    state.footnotes = apply;
    return report();
  };
  const api = mockReaderApi(doc, {
    // The server counts what is read aloud: a minute more while every sentence is read.
    [`GET /api/documents/${doc.id}`]: () => ({
      ...doc,
      estimatedSeconds: Object.keys(state.skipped).length ? 600 : 660,
    }),
    [`GET /api/documents/${doc.id}/styles`]: styles,
    [`PUT /api/documents/${doc.id}/styles`]: (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { indexes: number[]; skip: boolean };
      for (const index of body.indexes) {
        if (body.skip) state.skipped[index] = 'manual';
        else delete state.skipped[index];
      }
      return styles();
    },
    [`GET /api/documents/${doc.id}/cleanup`]: report,
    [`POST /api/documents/${doc.id}/cleanup/undo`]: cleanup(false),
    [`POST /api/documents/${doc.id}/cleanup/apply`]: cleanup(true),
  });
  renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${doc.id}` });
  return api;
}

const sentence = (text: string) => screen.getByText(text, { selector: '.reader-seg' });
const skippedState = (text: string) => sentence(text).getAttribute('data-skipped');

/** Selects one sentence's text, as a reader would before choosing "Voice & effect". */
async function styleSentence(text: string) {
  document.getSelection()?.selectAllChildren(sentence(text));
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Voice & effect' }));
  return screen.findByRole('dialog', { name: 'Voice and effect' });
}

describe('Skipped sentences and the cleanup', () => {
  it('keeps skipped sentences in the text, muted and labelled, and never plays them', async () => {
    const { calls } = openReader();
    await screen.findByText('Sentence 1.', { selector: '.reader-seg' });
    await waitFor(() => expect(skippedState('Sentence 1.')).toBe('true'));
    expect(sentence('Sentence 1.')).toHaveAccessibleName('Sentence 1. skipped');
    expect(sentence('Sentence 1.')).toHaveAttribute('title', 'Skipped when reading aloud');
    expect(skippedState('Sentence 2.')).toBe('false');
    await userEvent.click(sentence('Sentence 1.')); // play from the header
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/segments/1/audio'))).toBe(true),
    );
    expect(calls.some((call) => call.path.endsWith('/segments/0/audio'))).toBe(false);
  });

  it('skips a sentence by hand and reads a skipped one again', async () => {
    const { calls } = openReader();
    await waitFor(() => expect(skippedState('Sentence 1.')).toBe('true'));
    const dialog = await styleSentence('Sentence 2.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip when reading' }));
    await waitFor(() => expect(skippedState('Sentence 2.')).toBe('true'));
    const sent = calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/styles'));
    expect(JSON.parse(String(sent.at(-1)?.body))).toEqual({ indexes: [1], skip: true });
    // The note counts it, refreshed after the change.
    expect(await screen.findByText(/1 sentence you chose/)).toBeInTheDocument();
    const again = await styleSentence('Sentence 1.');
    await userEvent.click(within(again).getByRole('button', { name: 'Read this sentence' }));
    await waitFor(() => expect(skippedState('Sentence 1.')).toBe('false'));
  });

  it('shows the cleanup as a note that lists, shows, undoes and applies it again', async () => {
    const { calls } = openReader();
    expect(await screen.findByText(OTHER)).toBeInTheDocument();
    const summary = await screen.findByText(
      'Skipped when reading aloud: 1 running header, 1 footnote marker.',
    );
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument(); // the note takes its place
    await userEvent.click(summary);
    expect(screen.getByText('Running headers')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: `Show in the text: Sentence 3. not read: ${MARKER}` }),
    );
    await waitFor(() => expect(sentence('Sentence 3.')).toHaveAttribute('data-active', 'true'));

    await userEvent.click(screen.getByRole('button', { name: 'Read them all again' }));
    expect(
      await screen.findByText(/^Everything is read aloud, including 1 running header/),
    ).toBeInTheDocument();
    await waitFor(() => expect(skippedState('Sentence 1.')).toBe('false'));
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/undo'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Skip them again' }));
    await waitFor(() => expect(skippedState('Sentence 1.')).toBe('true'));
  });

  it('shows the listening time of what is read, as the server counts it', async () => {
    openReader();
    expect(await screen.findByText('~10 min listen')).toBeInTheDocument();
    await userEvent.click(await screen.findByText(/^Skipped when reading aloud/));
    await userEvent.click(screen.getByRole('button', { name: 'Read them all again' }));
    expect(await screen.findByText('~11 min listen')).toBeInTheDocument();
  });

  it('counts footnotes at the foot of a page by the note, and citation markers one by one', async () => {
    const found = (index: number, reason: CleanupItem['reason'], markers: string[]) => ({
      index,
      sectionIndex: 0,
      reason,
      text: `Sentence ${(index + 1).toString()}.`,
      markers,
      applied: true,
    });
    mockReaderApi(doc, {
      [`GET /api/documents/${doc.id}/styles`]: {
        segments: [{ index: 1, skip: 'footnote_text' }],
        dialogueVoiceId: null,
        splitDialogue: true,
        revision: 'r',
      },
      [`GET /api/documents/${doc.id}/cleanup`]: {
        notice: null,
        items: [found(1, 'footnote_text', []), found(2, 'citation', ['[3]', '[4, 5]'])],
      },
    });
    renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${doc.id}` });
    await userEvent.click(
      await screen.findByText('Skipped when reading aloud: 1 footnote, 2 citation markers.'),
    );
    expect(screen.getByText('Footnotes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show in the text: Sentence 3. not read: [3] [4, 5]' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(skippedState('Sentence 2.')).toBe('true'));
  });

  it('stays out of the way when nothing was found', async () => {
    openReader({ found: false });
    await screen.findByText('Sentence 1.', { selector: '.reader-seg' });
    expect(screen.queryByText(/Skipped when reading aloud/)).not.toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
    expect(skippedState('Sentence 1.')).toBe('false');
  });
});

describe('Counting what is read aloud', () => {
  it('has the document and the library counted again after an undo, an apply or a skip', async () => {
    mockApi({
      [`POST /api/documents/${doc.id}/cleanup/`]: { items: [], notice: null },
      [`PUT /api/documents/${doc.id}/styles`]: {
        segments: [],
        dialogueVoiceId: null,
        splitDialogue: true,
        revision: 'r',
      },
    });
    const client = createQueryClient();
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ cleanup: useCleanupAction(doc.id), styles: useStyleSentences(doc.id) }),
      { wrapper },
    );
    const counted = () => {
      client.setQueryData(keys.document(doc.id), doc);
      client.setQueryData(keys.documents, [doc]);
    };
    const recount = () =>
      [keys.document(doc.id), keys.documents].map(
        (key) => client.getQueryState(key)?.isInvalidated,
      );
    const changes = [
      () => result.current.cleanup.mutateAsync('undo'),
      () => result.current.cleanup.mutateAsync('apply'),
      () => result.current.styles.mutateAsync({ indexes: [1], skip: true }),
    ];
    for (const change of changes) {
      counted();
      await act(async () => {
        await change();
      });
      expect(recount()).toEqual([true, true]);
    }
    counted();
    await act(async () => {
      await result.current.styles.mutateAsync({ indexes: [1], effect: 'radio' });
    });
    expect(recount()).toEqual([false, false]); // an effect doesn't change what is read
  });
});
