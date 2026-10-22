// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for browsing, previewing and choosing voices in the voice library.
 * Scope: Filters (search, language, gender, source), the standard-sample preview, stopping and
 *   finishing previews, superseded and failed previews, choosing the reading voice (with and without
 *   saved preferences), voice card details, and loading/empty/error states.
 * Does NOT belong: Creating custom voices (features/studio tests).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import VoiceLibraryPage from './VoiceLibraryPage';

afterEach(() => vi.unstubAllGlobals());

const voices = [
  voice({ description: 'Warm and clear.', attribution: 'Synthetic voice from the Kokoro-82M model (Apache-2.0).' }),
  voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)', gender: 'male' }),
  voice({ id: 'piper:x', name: 'Xavier', engineId: 'piper', language: 'French', gender: 'male', qualityGrade: null }),
  voice({ id: 'custom:me', name: 'Me', category: 'custom', engineId: 'chatterbox', language: 'English', gender: 'unspecified' }),
]; // prettier-ignore

const audio = () => new Response(new Blob(['wav']), { headers: { 'X-Audio-Url': '/api/audio/k' } });

function api(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': voices,
    'PUT /api/preferences': (_url: URL, init: RequestInit) => JSON.parse(String(init.body)),
    'POST /api/voices/': audio,
    ...overrides,
  });
}

async function renderVoices() {
  const user = userEvent.setup();
  renderWithApp(<VoiceLibraryPage />);
  await screen.findByRole('button', { name: 'Preview George' });
  // A card heading is the name, then a badge for the default voice.
  const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.firstChild?.textContent);
  return { user, names };
} // prettier-ignore

describe('Voice library filters', () => {
  it('narrows the list by search, language, gender and source', async () => {
    api();
    const { user, names } = await renderVoices();
    expect(names()).toEqual(['Heart', 'George', 'Xavier', 'Me']);
    await user.type(screen.getByRole('textbox', { name: 'Search voices' }), 'english');
    expect(names()).toEqual(['Heart', 'George', 'Me']);
    await user.selectOptions(screen.getByLabelText('Language'), 'English (UK)');
    expect(names()).toEqual(['George']);
    await user.selectOptions(screen.getByLabelText('Gender'), 'female');
    expect(screen.getByText('No voices match these filters')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Language'), 'all');
    await user.selectOptions(screen.getByLabelText('Gender'), 'all');
    await user.selectOptions(screen.getByLabelText('Source'), 'custom');
    expect(names()).toEqual(['Me']);
    expect(screen.getByText('Showing 1 of 4 voices.', { exact: false })).toBeInTheDocument();
  });

  it('shows card details and lists languages alphabetically', async () => {
    api();
    await renderVoices();
    const languages = within(screen.getByLabelText('Language')).getAllByRole('option');
    expect(languages.map((option) => option.textContent)).toEqual([
      'All languages',
      'English',
      'English (UK)',
      'English (US)',
      'French',
    ]);
    expect(screen.getByText('Warm and clear.')).toBeInTheDocument();
    expect(
      screen.getByText('Synthetic voice from the Kokoro-82M model (Apache-2.0).'),
    ).toBeInTheDocument();
    expect(screen.getByText('French · male · piper')).toBeInTheDocument();
    expect(screen.getByText('English · Chatterbox')).toBeInTheDocument();
  });
});

describe('Voice previews', () => {
  it('plays the standard sample, stops, and returns to idle when a preview ends', async () => {
    const { calls } = api();
    const { user } = await renderVoices();
    await user.click(screen.getByRole('button', { name: 'Preview Heart' }));
    const stop = await screen.findByRole('button', { name: 'Stop preview of Heart' });
    expect(JSON.parse(String(calls.find((call) => call.method === 'POST')?.body))).toEqual({
      text: null,
      pace: 1,
    });
    await user.click(stop);
    expect(screen.getByRole('button', { name: 'Preview Heart' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Preview Heart' }));
    await screen.findByRole('button', { name: 'Stop preview of Heart' });
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1); // reused audio
    const element = vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.at(-1) as HTMLAudioElement;
    act(() => {
      fireEvent(element, new Event('ended'));
    });
    expect(await screen.findByRole('button', { name: 'Preview Heart' })).toBeInTheDocument();
  }); // prettier-ignore

  it('drops a superseded preview and explains a failed one', async () => {
    api({
      'GET /api/preferences': json({ error: { code: 'x', message: 'x' } }, 500),
      'POST /api/voices/kokoro:af_heart': (_url: URL, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Superseded', 'AbortError')),
          ),
        ),
    });
    const { user } = await renderVoices();
    await user.click(screen.getByRole('button', { name: 'Preview Heart' }));
    expect(await screen.findByRole('button', { name: 'Preview Heart' })).toBeDisabled();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Unsupported audio.'));
    await user.click(screen.getByRole('button', { name: 'Preview George' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported audio.');
    expect(screen.getByRole('button', { name: 'Preview Heart' })).toBeEnabled();
  }); // prettier-ignore
});

describe('Choosing the reading voice', () => {
  it('saves the chosen voice and confirms it', async () => {
    const { calls } = api();
    const { user } = await renderVoices();
    await user.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: 'Use for reading' }));
    expect(await screen.findByText('George is now your reading voice')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  }); // prettier-ignore

  it('still switches the player when preferences are unavailable', async () => {
    const { calls } = api({ 'GET /api/preferences': json({ error: { code: 'x', message: 'x' } }, 500) });
    const { user } = await renderVoices();
    const [first] = screen.getAllByRole('button', { name: 'Use for reading' });
    await user.click(first as HTMLElement);
    expect(await screen.findByText(/is now your reading voice/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  }); // prettier-ignore
});

describe('Voice library states', () => {
  it('explains when voices cannot be loaded', async () => {
    api({ 'GET /api/voices': json({ error: { code: 'down', message: 'Server busy.' } }, 503) });
    renderWithApp(<VoiceLibraryPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load voicesServer busy.");
  });
});
