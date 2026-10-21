// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the local speech API settings.
 * Scope: The collapsed section and its summary, turning the API on, a new token shown once (copied,
 *   then gone, and kept in no cache), replacing and revoking the token after a confirmation,
 *   allowing a cloned voice (with the consent note), the network permission and what it exposes, the
 *   usage line, the example command, errors, opening from a link, "… ago" wording and the settings
 *   index entry.
 * Does NOT belong: The app shell's in-use sign (app/speechApiIndicator.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpeechApiSettingsInput, SpeechApiStatus } from '@/api/types';
import { json, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import SettingsPage from './SettingsPage';
import { timeAgo } from './SpeechApiParts';
import { SpeechApiSection } from './SpeechApiSection';

afterEach(() => vi.unstubAllGlobals());

const TOKEN = 'ttsn_FAKE-token-for-tests-0123456789abcdefghijk';
const MADE = '2026-10-20T10:00:00+00:00';
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const status = (overrides: Partial<SpeechApiStatus> = {}): SpeechApiStatus => ({
  enabled: false, allowNetwork: false, allowedVoices: [], hasToken: false, tokenCreatedAt: null, networkMode: false,
  port: 8765, maxInputChars: 4000, requestsPerMinute: 60,
  usage: { requests: 0, lastUsedAt: null, lastVoiceId: null, inProgress: false, active: false },
  ...overrides,
}); // prettier-ignore

function setup(
  initial: SpeechApiStatus = status(),
  routes: Record<string, unknown> = {},
  route = '/settings',
  page: ReactNode = <SpeechApiSection />,
) {
  let current = initial;
  const api = mockApi({
    'GET /api/speech-api': () => current,
    'PUT /api/speech-api': (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SpeechApiSettingsInput;
      current = { ...current, ...body, allowedVoices: body.allowedVoices ?? [] };
      return current;
    },
    'POST /api/speech-api/token': () => {
      current = { ...current, hasToken: true, tokenCreatedAt: MADE };
      return json({ token: TOKEN, createdAt: MADE }, 201);
    },
    'DELETE /api/speech-api/token': () => {
      current = { ...current, hasToken: false, tokenCreatedAt: null };
      return new Response(null, { status: 204 });
    },
    'GET /api/voices': [
      voice(),
      voice({ id: 'custom:me', name: 'Me', engineId: 'chatterbox', category: 'custom' }),
      voice({ id: 'blend:mix', name: 'Mix', category: 'custom' }), // not a cloned voice: never offered
    ],
    ...routes,
  });
  const view = renderWithApp(page, { path: '/settings', route });
  const saves = () =>
    api.calls
      .filter((call) => call.method === 'PUT')
      .map((call) => JSON.parse(String(call.body)) as SpeechApiSettingsInput);
  const count = (method: string) => api.calls.filter((call) => call.method === method).length;
  return { ...api, ...view, saves, count, user: userEvent.setup() };
}

async function openSection(user: ReturnType<typeof userEvent.setup>) {
  const section = await screen.findByRole('region', { name: 'Local speech API' });
  const toggle = within(section).getByRole('button', { name: /Speech API settings/ });
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return section;
}

describe('Local speech API settings', () => {
  it('stays collapsed until opened, turns the API on and shows a new token only once', async () => {
    const { saves, user, queryClient } = setup();
    const section = await screen.findByRole('region', { name: 'Local speech API' });
    expect(
      await within(section).findByText(/^Off\. Programs on this computer/),
    ).toBeInTheDocument();
    expect(within(section).getByText('Off')).toBeInTheDocument();
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
    await openSection(user);
    const power = within(section).getByRole('switch', { name: 'Turn on the speech API' });
    expect(power).not.toBeChecked();
    expect(within(section).getByText('No token yet. Programs need one to use the API.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/Not used since TTSNative started\. 0 requests served\./)).toBeInTheDocument(); // prettier-ignore
    await user.click(power);
    await waitFor(() => expect(power).toBeChecked());
    expect(saves()).toEqual([{ enabled: true, allowNetwork: false, allowedVoices: [] }]);
    expect(within(section).getByText('On')).toBeInTheDocument();
    expect(within(section).getByText('On, but programs need a token to connect.')).toBeInTheDocument(); // prettier-ignore

    await user.click(within(section).getByRole('button', { name: 'Create token' }));
    const shown = await within(section).findByLabelText('New API token');
    expect(shown).toHaveValue(TOKEN);
    expect(within(section).getByText("Copy your new token now. You won't see it again.")).toBeInTheDocument(); // prettier-ignore
    await user.click(shown); // focusing selects it, ready to copy by hand
    await user.click(within(section).getByRole('button', { name: 'Copy token' }));
    expect(await screen.findByText('Token copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(TOKEN);
    expect(await within(section).findByText(/A token was made on/)).toBeInTheDocument();
    expect(within(section).getByText('On.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: "I've copied it" }));
    expect(document.body).not.toHaveTextContent(TOKEN);
    const cached = [
      ...queryClient.getQueryCache().getAll(),
      ...queryClient.getMutationCache().getAll(),
    ];
    expect(JSON.stringify(cached.map((entry) => entry.state.data))).not.toContain(TOKEN);
  });

  it('replaces and revokes the token after a confirmation', async () => {
    const used = { requests: 2, lastUsedAt: minutesAgo(5), lastVoiceId: 'custom:gone', inProgress: false, active: false }; // prettier-ignore
    const { count, user } = setup(
      status({ enabled: true, hasToken: true, tokenCreatedAt: MADE, usage: used }),
    );
    const section = await openSection(user);
    expect(await within(section).findByText(/Last used 5 minutes ago\. 2 requests served\./)).toBeInTheDocument(); // prettier-ignore
    await user.click(within(section).getByRole('button', { name: 'New token' }));
    const replace = await screen.findByRole('dialog', { name: 'Make a new token?' });
    expect(replace).toHaveTextContent('The current token stops working at once.');
    await user.click(within(replace).getByRole('button', { name: 'Cancel' }));
    expect(count('POST')).toBe(0);
    await user.click(within(section).getByRole('button', { name: 'New token' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Make new token' })); // prettier-ignore
    expect(await within(section).findByLabelText('New API token')).toHaveValue(TOKEN);
    expect(count('POST')).toBe(1);

    await user.click(within(section).getByRole('button', { name: 'Revoke token' }));
    const revoke = await screen.findByRole('dialog', { name: 'Revoke the token?' });
    await user.click(within(revoke).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Token revoked')).toBeInTheDocument();
    expect(count('DELETE')).toBe(1);
    expect(await within(section).findByText('No token yet. Programs need one to use the API.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByLabelText('New API token')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Revoke token' })).not.toBeInTheDocument();
  });

  it('allows a cloned voice only when asked, and explains the network permission', async () => {
    const { saves, user } = setup(status({ enabled: true, hasToken: true, tokenCreatedAt: MADE }));
    const section = await openSection(user);
    const voices = within(section).getByRole('group', { name: 'Custom voices programs may use' });
    expect(voices).toHaveTextContent('never use it to pass as someone else');
    const me = await within(voices).findByRole('checkbox', { name: 'Allow Me' });
    expect(me).not.toBeChecked();
    expect(within(voices).getAllByRole('checkbox')).toEqual([me]); // not built-in voices or blends
    await user.click(me);
    await waitFor(() => expect(me).toBeChecked());
    await user.click(me);
    await waitFor(() => expect(me).not.toBeChecked());
    expect(saves().map((save) => save.allowedVoices)).toEqual([['custom:me'], []]);

    const lan = within(section).getByRole('switch', { name: 'Allow other devices on my network' });
    expect(lan).not.toBeChecked();
    expect(section).toHaveTextContent(
      'others on the same network could read the text and the token',
    );
    expect(section).toHaveTextContent('only listens on this computer right now');
    await user.click(lan);
    await waitFor(() => expect(lan).toBeChecked());
    expect(saves().at(-1)).toEqual({ enabled: true, allowNetwork: true, allowedVoices: [] });
    expect(within(section).getByText('Other devices on your network that have the token can use the speech API.')).toBeInTheDocument(); // prettier-ignore
  });

  it('shows how the API is used, an example command and the limits', async () => {
    const usage = { requests: 3, lastUsedAt: minutesAgo(2), lastVoiceId: 'kokoro:af_heart', inProgress: true, active: true }; // prettier-ignore
    const { user } = setup(status({ enabled: true, hasToken: true, tokenCreatedAt: MADE, networkMode: true, usage })); // prettier-ignore
    const section = await openSection(user);
    const line = await within(section).findByRole('status', { name: 'Speech API use' });
    await waitFor(() => expect(line).toHaveTextContent('In use now. Last used 2 minutes ago, with Heart. 3 requests served.')); // prettier-ignore
    const command = within(section).getByText(/^curl /);
    expect(command).toHaveTextContent('curl http://127.0.0.1:8765/v1/audio/speech -H "Authorization: Bearer $TTSNATIVE_TOKEN"'); // prettier-ignore
    expect(command).toHaveTextContent('"voice":"kokoro:af_heart"');
    await user.click(within(section).getByRole('button', { name: 'Copy command' }));
    expect(await screen.findByText('Command copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toContain('/v1/audio/speech');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(within(section).getByRole('button', { name: 'Copy command' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed');
    expect(section).toHaveTextContent('Up to 4,000 characters a request, 60 requests a minute');
    expect(section).toHaveTextContent('accepting network connections now');
    expect(within(section).getByRole('link', { name: 'Read the guide' })).toHaveAttribute('href', expect.stringContaining('docs/guides/local-speech-api.md')); // prettier-ignore
  });

  it('reports a status that failed to load and a change that failed to save', async () => {
    const down = json({ error: { code: 'down', message: 'The server is restarting.' } }, 503);
    const first = setup(status(), { 'GET /api/speech-api': down });
    const section = await openSection(first.user);
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'The server is restarting.',
    );
    expect(within(section).getByText('For scripts, screen readers and home automation.')).toBeInTheDocument(); // prettier-ignore
    first.unmount();

    const refused = json({ error: { code: 'invalid', message: 'Not saved.' } }, 422);
    const second = setup(status(), { 'PUT /api/speech-api': refused }, '/settings#speech-api');
    const power = await screen.findByRole('switch', { name: 'Turn on the speech API' }); // the link opened it
    expect(screen.getByText(/http:\/\/127\.0\.0\.1:8765\/v1\/audio\/speech/)).toBeInTheDocument();
    await second.user.click(power);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The speech API settings didn't change",
    );
    expect(power).not.toBeChecked();
  });

  it('falls back to the default port and makes the first token without asking', async () => {
    const { count, user } = setup(status({ port: null }), { 'GET /api/voices': [voice()] });
    const section = await openSection(user);
    expect(await within(section).findByText('You have no custom voices.')).toBeInTheDocument();
    expect(within(section).getByText(/^curl http:\/\/127\.0\.0\.1:8765\/v1/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Create token' }));
    expect(await within(section).findByLabelText('New API token')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(count('POST')).toBe(1);
  });

  it('says how long ago in coarse steps', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(timeAgo('2026-10-20T11:59:30Z', now)).toBe('less than a minute ago');
    expect(timeAgo('2026-10-20T11:55:00Z', now)).toBe('5 minutes ago');
    expect(timeAgo('2026-10-20T10:00:00Z', now)).toBe('2 hours ago');
    expect(timeAgo('2026-10-17T12:00:00Z', now)).toBe('3 days ago');
  });

  it('is listed in the settings index', async () => {
    setup(status(), { 'GET /api/preferences': preferences }, '/settings', <SettingsPage />);
    const index = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(within(index).getByRole('link', { name: 'Speech API' })).toHaveAttribute('href', '#speech-api'); // prettier-ignore
    expect(await screen.findByRole('region', { name: 'Local speech API' })).toBeInTheDocument();
  });
});
