// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the reader's cast: the dialogue voice, the characters and the saved casts.
 * Scope: The "Voices & effects" dialog chooses the dialogue voice (or none), styles the sentence
 *   being read, gives characters voices (or takes them back), adds a name, splits narration, saves,
 *   reuses and removes casts, clears every styled sentence, offers no voices until they have loaded
 *   (and adds no character without one), explains refusals, and leaves alone a player that reads
 *   another document.
 * Does NOT belong: Styling chosen sentences (styling.test.tsx) or reading (reader.test.tsx).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openStyledReader,
  refused,
  selectSentences,
  sentence,
  SERIES,
  styledDoc as doc,
  styles,
  VOICES,
} from '@/test/styledReader';

afterEach(() => vi.unstubAllGlobals());

async function openCast(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Voices & effects' }));
  return screen.findByRole('dialog', { name: 'Voices and effects' });
}

describe('Voices and effects', () => {
  it('chooses the dialogue voice and clears every styled sentence', async () => {
    const { calls } = openStyledReader(styles({ segments: [{ index: 3, effect: 'hall' }] }));
    const user = userEvent.setup();
    const dialog = await openCast(user);
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

  it('gives characters voices, adds a name, splits narration and saves the cast', async () => {
    const { calls } = openStyledReader();
    const user = userEvent.setup();
    const dialog = await openCast(user);
    const nicole = await within(dialog).findByLabelText(/Nicole · 3 lines/);
    expect(within(dialog).getByText('"Ready?" asked Nicole.')).toBeInTheDocument();
    await user.selectOptions(nicole, 'custom:sam');
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'PUT' && call.path.endsWith('/characters'))).toBe(
        true,
      ),
    );
    await user.type(within(dialog).getByLabelText('Add a character'), 'The Guard');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByLabelText('The Guard')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: /Narrator reads the narration/ }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/cast'))).toBe(true));
    const cast = calls.find((call) => call.path.endsWith('/cast'));
    expect(JSON.parse(String(cast?.body))).toEqual({ splitDialogue: false });
    await user.click(within(dialog).getByText('Saved casts'));
    await user.type(within(dialog).getByLabelText('Save this cast as'), 'Series');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('button', { name: 'Use here' })).toBeInTheDocument();
  });

  it('styles the sentence being read, resets voices, and reuses or removes a saved cast', async () => {
    const { calls, state } = openStyledReader(styles({ dialogueVoiceId: 'custom:sam' }));
    state.presets = [SERIES];
    const user = userEvent.setup();
    await screen.findByText('Sentence 1.', { selector: '.reader-seg' });
    let dialog = await openCast(user);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Style the sentence being read' }),
    );
    const styling = await screen.findByRole('dialog', { name: 'Voice and effect' });
    expect(within(styling).getByText(/^How this sentence should sound/)).toBeInTheDocument();
    await user.click(within(styling).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openCast(user);
    await user.selectOptions(within(dialog).getByLabelText('Dialogue voice'), '');
    await user.selectOptions(await within(dialog).findByLabelText(/Nicole/), '');
    const put = (suffix: string) =>
      calls
        .filter((call) => call.method === 'PUT' && call.path.endsWith(suffix))
        .map((call) => JSON.parse(String(call.body)) as unknown);
    await waitFor(() => expect(put('/characters')).toEqual([{ name: 'Nicole', voiceId: null }]));
    expect(put('/cast')).toEqual([{ dialogueVoiceId: null }]);
    // An empty name, submitted anyway, adds and saves nothing.
    fireEvent.submit(within(dialog).getByLabelText('Add a character').closest('form')!);
    await user.click(within(dialog).getByText('Saved casts'));
    fireEvent.submit(within(dialog).getByLabelText('Save this cast as').closest('form')!);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(put('/characters')).toHaveLength(1);

    expect(within(dialog).getByText(/^Series/)).toHaveTextContent('Series (1 characters)');
    await user.click(within(dialog).getByRole('button', { name: 'Use here' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/apply'))).toBe(true));
    expect(await within(dialog).findByLabelText(/Nicole/)).toHaveValue('custom:sam');
    await user.click(within(dialog).getByRole('button', { name: 'Remove the saved cast Series' }));
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Use here' })).not.toBeInTheDocument(),
    );
  });

  it('explains a dialogue voice, a clearing or a saved cast the server refuses', async () => {
    const { state } = openStyledReader(styles({ segments: [{ index: 3, effect: 'hall' }] }), {
      [`PUT /api/documents/${doc.id}/cast`]: refused('The cast is locked.'),
      [`PUT /api/documents/${doc.id}/styles`]: refused('Styling is locked.'),
      [`POST /api/documents/${doc.id}/cast-presets/`]: refused('Saved casts are locked.'),
    });
    state.presets = [SERIES];
    const user = userEvent.setup();
    const dialog = await openCast(user);
    const alerts = () =>
      within(dialog)
        .queryAllByRole('alert')
        .map((alert) => alert.textContent);
    await user.selectOptions(within(dialog).getByLabelText('Dialogue voice'), 'custom:sam');
    await waitFor(() => expect(alerts()).toEqual(['The cast is locked.']));
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(alerts()).toEqual(['The cast is locked.', 'Styling is locked.']));
    await user.click(within(dialog).getByText('Saved casts'));
    await user.click(await within(dialog).findByRole('button', { name: 'Use here' }));
    await waitFor(() => expect(alerts()).toContain('Saved casts are locked.'));
  });

  it('offers no voices until they have loaded, and adds no character without one', async () => {
    let release: (voices: unknown) => void = () => undefined;
    const { calls } = openStyledReader(styles(), {
      'GET /api/voices': () => new Promise((resolve) => (release = resolve)),
    });
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    const dialog = await openCast(user);
    const nicole = await within(dialog).findByLabelText(/Nicole/);
    const options = (select: HTMLElement) =>
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(options(nicole)).toEqual(['The dialogue voice']);
    await user.type(within(dialog).getByLabelText('Add a character'), 'The Guard');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByLabelText('Add a character')).toHaveValue('The Guard'); // kept
    expect(calls.some((call) => call.path.endsWith('/characters') && call.method === 'PUT')).toBe(false); // prettier-ignore
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    selectSentences(sentence('Sentence 2.'), sentence('Sentence 2.'));
    await user.click(await screen.findByRole('button', { name: 'Voice & effect' }));
    const styling = await screen.findByRole('dialog', { name: 'Voice and effect' });
    expect(options(within(styling).getByLabelText('Voice'))).toEqual(['The reading voice']);
    release(VOICES);
    expect(
      await within(styling).findByRole('option', { name: 'George · English (UK)' }),
    ).toBeInTheDocument();
  });

  it('leaves alone a player that reads another document', async () => {
    const { calls, controller } = openStyledReader();
    const user = userEvent.setup();
    await screen.findByText('Sentence 2.', { selector: '.reader-seg' });
    act(() => controller().unload());
    const audio = () => calls.filter((call) => call.path.includes('/segments/')).length;
    const before = audio();
    const dialog = await openCast(user);
    await user.click(within(dialog).getByRole('switch', { name: /Narrator reads the narration/ }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/cast'))).toBe(true));
    expect(audio()).toBe(before); // nothing is playing this document, so nothing to fetch again
  });
});
