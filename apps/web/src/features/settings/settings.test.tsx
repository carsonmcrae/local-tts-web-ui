// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Settings screen's preferences and system sections.
 * Scope: Saving playback preferences (voice, speed, pace, export format, follow-along) and applying
 *   them to the player, deep links to a section, storage usage with cache clearing, the
 *   network-exposure warning, version details and copying diagnostics (success and failure).
 * Does NOT belong: The theme switch and diagnostics text (src/test/screens.test.tsx).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemInfo } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import { DEFAULT_READING_TEXT, readReadingText } from '@/lib/readingText';
import { json, kokoro, mockApi, PlayerSpy, preferences, renderWithApp, voice } from '@/test/render';
import SettingsPage from './SettingsPage';
import { diagnosticsReport } from './SystemSections';

afterEach(() => vi.unstubAllGlobals());

const system: SystemInfo = {
  version: '2.0.0', python: '3.12.10', platform: 'Windows 11', machine: 'AMD64', cpuCores: 8,
  memoryTotalBytes: 16 * 1024 ** 3, memoryAvailableBytes: 8 * 1024 ** 3, gpus: [],
  onnxProviders: ['CPUExecutionProvider'], networkExposed: true, telemetry: false, limits: {},
  storage: { dataDir: 'C:/ltts', freeBytes: 50e9, totalBytes: 100e9, modelsBytes: 3e8, audioCacheBytes: 5e7,
    audioCacheLimitBytes: 1e8, voicesBytes: 1e6, exportsBytes: 2e6, databaseBytes: 3e5 },
}; // prettier-ignore

const failure = () => json({ error: { code: 'down', message: 'The server is restarting.' } }, 503);

function api(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [
      voice(),
      voice({ id: 'custom:me', name: 'Me', language: 'English', available: false }),
      voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)' }),
    ],
    'GET /api/system': system,
    'GET /api/pronunciations': [],
    'PUT /api/preferences': (_url: URL, init: RequestInit) => JSON.parse(String(init.body)),
    ...overrides,
  });
}

function renderSettings(route = '/settings') {
  const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
  const view = renderWithApp(
    <>
      <SettingsPage />
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
    { path: '/settings', route },
  );
  return { user: userEvent.setup(), player: () => latest.player, ...view };
}

describe('Reading text', () => {
  it('changes the size, spacing and typeface of the reading text on this device', async () => {
    api();
    const { user } = renderSettings();
    const appearance = await screen.findByRole('region', { name: 'Appearance' });
    await user.click(within(appearance).getByRole('radio', { name: 'Large' }));
    await user.click(within(appearance).getByRole('radio', { name: 'Relaxed' }));
    await user.click(within(appearance).getByRole('radio', { name: 'Sans serif' }));
    const preview = within(appearance).getByLabelText('Reading text preview');
    expect(preview).toHaveAttribute('data-typeface', 'sans');
    expect(preview.style.getPropertyValue('--reader-scale')).toBe('1.15');
    expect(preview.style.getPropertyValue('--reader-leading')).toBe('2.05');
    expect(JSON.parse(localStorage.getItem('ltts.readingText') ?? '{}')).toEqual({
      size: 'large',
      spacing: 'relaxed',
      typeface: 'sans',
    });
  });

  it('reads only sensible saved values and still applies a change without storage', async () => {
    localStorage.setItem(
      'ltts.readingText',
      JSON.stringify({ size: 'huge', spacing: 'compact', typeface: 7 }),
    );
    expect(readReadingText()).toEqual({ size: 'medium', spacing: 'compact', typeface: 'serif' });
    localStorage.setItem('ltts.readingText', '{not json');
    expect(readReadingText()).toEqual(DEFAULT_READING_TEXT);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    api();
    const { user } = renderSettings();
    const appearance = await screen.findByRole('region', { name: 'Appearance' });
    await user.click(within(appearance).getByRole('radio', { name: 'Extra large' }));
    expect(within(appearance).getByRole('radio', { name: 'Extra large' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('Playback preferences', () => {
  it('saves each preference and applies it to the player', async () => {
    const { calls } = api();
    const { user, player } = renderSettings();
    const playback = await screen.findByRole('region', { name: 'Playback' });
    const voiceSelect = within(playback).getByLabelText('Default voice');
    expect(within(voiceSelect).getByRole('option', { name: /Me · English \(not installed\)/ })).toBeDisabled();
    await user.selectOptions(voiceSelect, 'kokoro:bm_george');
    await user.selectOptions(within(playback).getByLabelText('Playback speed'), '1.5');
    await user.selectOptions(within(playback).getByLabelText('Export format'), 'wav');
    await user.click(within(playback).getByRole('switch', { name: 'Follow along while listening' }));
    const pace = within(playback).getByRole('slider', { name: 'Speaking pace' });
    act(() => pace.focus());
    await user.keyboard('{ArrowRight}');
    const saved = calls
      .filter((call) => call.method === 'PUT')
      .map((call) => JSON.parse(String(call.body)) as Record<string, unknown>);
    expect(saved).toEqual([
      expect.objectContaining({ defaultVoiceId: 'kokoro:bm_george' }),
      expect.objectContaining({ playbackRate: 1.5 }),
      expect.objectContaining({ exportFormat: 'wav' }),
      expect.objectContaining({ autoScroll: false }),
      expect.objectContaining({ pace: 1.05 }),
    ]);
    await waitFor(() =>
      expect(player()?.state).toMatchObject({ voiceId: 'kokoro:bm_george', rate: 1.5, pace: 1.05 }),
    );
  }); // prettier-ignore

  it('lists no voices when they cannot be loaded', async () => {
    api({ 'GET /api/voices': failure() });
    renderSettings();
    const playback = await screen.findByRole('region', { name: 'Playback' });
    expect(within(within(playback).getByLabelText('Default voice')).queryAllByRole('option')).toEqual([]);
  }); // prettier-ignore
});

describe('System sections', () => {
  it('scrolls a deep-linked section into view', async () => {
    api();
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    renderSettings('/settings#storage');
    await screen.findByRole('region', { name: 'Storage' });
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  it('shows storage use and clears the audio cache after confirmation', async () => {
    const { calls } = api({ 'POST /api/system/cache/clear': { removedEntries: 42 } });
    const { user } = renderSettings();
    const storage = await screen.findByRole('region', { name: 'Storage' });
    expect(await within(storage).findByText('Data folder: C:/ltts')).toBeInTheDocument();
    expect(within(storage).getByRole('progressbar', { name: 'Audio cache usage' })).toHaveAttribute(
      'value',
      '50',
    );
    await user.click(within(storage).getByRole('button', { name: 'Clear audio cache' }));
    const confirm = await screen.findByRole('dialog', { name: 'Clear the audio cache?' });
    await user.click(within(confirm).getByRole('button', { name: 'Clear cache' }));
    expect(await screen.findByText('42 clips removed.')).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/system')).toHaveLength(2);
  });

  it('warns about network access and describes a system without a GPU', async () => {
    api();
    renderSettings();
    expect(await screen.findByText('Network access is on')).toBeInTheDocument();
    const about = screen.getByRole('region', { name: 'About & diagnostics' });
    expect(within(about).getByText('None detected (CPU mode)')).toBeInTheDocument();
    expect(within(about).getByText('Python 3.12.10')).toBeInTheDocument();
    expect(diagnosticsReport(system, '2.0.0')).toContain('GPUs: none detected');
  });

  it('lists GPUs, copies diagnostics and reports a failed copy', async () => {
    api({
      'GET /api/system': {
        ...system,
        gpus: [{ vendor: 'NVIDIA', name: 'RTX 4070', memoryMb: 12288 }],
      },
    });
    const { user } = renderSettings();
    const copy = await screen.findByRole('button', { name: 'Copy diagnostics' });
    expect(screen.getByText('RTX 4070')).toBeInTheDocument();
    await user.click(copy);
    expect(await screen.findByText('Diagnostics copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toContain('GPUs: NVIDIA RTX 4070');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(copy);
    expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed');
  });

  it('names the update check in the privacy summary of the desktop app', async () => {
    api();
    (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__ = true;
    try {
      renderSettings();
      const privacy = await screen.findByRole('region', { name: 'Privacy' });
      expect(privacy).toHaveTextContent('a check for new TTSNative versions on GitHub');
    } finally {
      delete (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__;
    }
  });

  it('shows placeholders and errors while the server is unavailable', async () => {
    api({ 'GET /api/system': failure(), 'GET /api/engines': failure() });
    vi.stubGlobal('__APP_VERSION__', undefined);
    renderSettings();
    const engines = await screen.findByRole('region', { name: 'Engines & models' });
    expect(await within(engines).findByRole('alert')).toHaveTextContent(
      'The server is restarting.',
    );
    const about = screen.getByRole('region', { name: 'About & diagnostics' });
    expect(within(about).getByText('dev')).toBeInTheDocument();
    expect(
      within(about).queryByRole('button', { name: 'Copy diagnostics' }),
    ).not.toBeInTheDocument();
  });
});
