// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for pairing a phone or tablet with TTSNative (the /pair page and its helpers).
 * Scope: The code from the QR link (dropped from the address at once) and the request it sends with
 *   the device's name, a typed code with or without the dash, a code that is too short, the server's
 *   refusals, a device that is paired already, why a pairing stopped working (it ended, or the
 *   device's address changed), guessing the device name and where to go afterwards.
 * Does NOT belong: Sending unpaired devices here (app/pairingRedirect.test.tsx) or the settings on
 *   the computer (features/settings/lan.test.tsx).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderWithApp } from '@/test/render';
import PairPage from './PairPage';
import { cleanCode, deviceName, formatCode, returnPath } from './pairing';

afterEach(() => vi.unstubAllGlobals());

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const PAIRED = { id: 'd'.repeat(32), name: 'iPhone', createdAt: '2026-10-21T09:00:00+00:00', lastSeenAt: null }; // prettier-ignore

function openPairPage(route: string, routes: Record<string, unknown> = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
  const api = mockApi({
    'GET /api/lan/device': { paired: false, name: null },
    'POST /api/lan/pair': () => json(PAIRED, 201),
    ...routes,
  });
  const view = renderWithApp(<PairPage />, { path: '/pair', route });
  const pairings = () =>
    api.calls
      .filter((call) => call.method === 'POST')
      .map((call) => JSON.parse(String(call.body)) as unknown);
  return { ...view, pairings, user: userEvent.setup() };
}

describe('Pairing page', () => {
  it('takes the code from the QR link, drops it from the address and pairs with the device name', async () => {
    const { router, pairings, user } = openPairPage('/pair#abcdefgh');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pair this device' })).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByLabelText('Pairing code')).toHaveValue('ABCD-EFGH');
    expect(screen.getByLabelText('Name for this device')).toHaveValue('iPhone');
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(router.state.location.pathname).toBe('/pair');
    expect(document.title).toBe('Pair this device · TTSNative');
    expect(screen.getByText(/so it isn.t secure against\s+other devices on the same network/)).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByText(/Recording with the microphone,\s+installing TTSNative as an app/)).toBeInTheDocument(); // prettier-ignore
    await user.click(screen.getByRole('button', { name: 'Pair this device' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
    expect(pairings()).toEqual([{ code: 'ABCD-EFGH', name: 'iPhone' }]);
    expect(await screen.findByText('iPhone can now use TTSNative.')).toBeInTheDocument();
  });

  it.each([
    ['address_changed', 'Pair this device again', /network address changed. TTSNative only accepts a device from the address it paired from/],
    ['expired', 'Its pairing has ended', /Pairings last up to 30 days, and end sooner if the device isn.t used for 14 days/],
  ])('says why a pairing stopped working (%s) before asking for a new code', async (reason, title, why) => {
    openPairPage('/pair', { 'GET /api/lan/device': { paired: false, name: null, reason } });
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.getByLabelText('Pairing code')).toBeInTheDocument();
    expect(screen.getByText(/for up to 30 days and only from this device.s network address/)).toBeInTheDocument();
  }); // prettier-ignore

  it('accepts a typed code with or without the dash and a name of its own', async () => {
    const { router, pairings, user } = openPairPage('/pair');
    const code = await screen.findByLabelText('Pairing code');
    expect(code).toHaveValue('');
    await user.type(code, 'wxyz 2345');
    const name = screen.getByLabelText('Name for this device');
    await user.clear(name);
    await user.type(name, '  Kitchen tablet ');
    await user.click(screen.getByRole('button', { name: 'Pair this device' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
    expect(pairings()).toEqual([{ code: 'WXYZ-2345', name: 'Kitchen tablet' }]);
  });

  it('asks for the whole code before sending anything, and names a nameless device', async () => {
    const { pairings, user } = openPairPage('/pair');
    await user.type(await screen.findByLabelText('Pairing code'), 'abc-d');
    await user.clear(screen.getByLabelText('Name for this device'));
    await user.click(screen.getByRole('button', { name: 'Pair this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the 8-character code shown on the computer.'); // prettier-ignore
    expect(pairings()).toEqual([]);
    await user.type(screen.getByLabelText('Pairing code'), 'efgh');
    await user.click(screen.getByRole('button', { name: 'Pair this device' }));
    await waitFor(() => expect(pairings()).toEqual([{ code: 'ABCD-EFGH', name: 'Phone or tablet' }])); // prettier-ignore
  });

  it.each([
    ['pairing_failed', "That code isn't right. Check it on the computer and try again."],
    ['pairing_rate_limited', 'Too many tries. Wait a minute, then try again.'],
    ['device_limit', 'Up to 20 devices can be paired. Remove one first.'],
  ])('shows the server’s message for %s and stays on the page', async (code, message) => {
    const refused = () => json({ error: { code, message } }, 403);
    const { router, user } = openPairPage('/pair#ABCD-EFGH', { 'POST /api/lan/pair': refused });
    await user.click(await screen.findByRole('button', { name: 'Pair this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe('/pair');
    expect(screen.getByLabelText('Pairing code')).toHaveValue('ABCD-EFGH');
  });

  it('says when this device is paired already', async () => {
    const { user, router } = openPairPage('/pair', {
      'GET /api/lan/device': { paired: true, name: 'Kitchen tablet' },
    });
    expect(await screen.findByText("It's paired as Kitchen tablet.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open your library' }));
    expect(router.state.location.pathname).toBe('/library');
  });
});

describe('Pairing helpers', () => {
  it('reads codes in any case, with or without the dash', () => {
    expect(cleanCode('#abcd-efgh')).toBe('ABCDEFGH');
    expect(formatCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatCode('ABC')).toBe('ABC');
  });

  it('guesses a name for the device', () => {
    expect(deviceName(IPHONE)).toBe('iPhone');
    expect(deviceName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari')).toBe('Phone or tablet'); // prettier-ignore
    expect(deviceName('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130 Mobile Safari')).toBe('Android phone'); // prettier-ignore
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130 Safari')).toBe('Tablet');
    expect(deviceName('Mozilla/5.0 (Linux; KFTRWI) Silk/120 like Chrome')).toBe('Tablet');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Phone or tablet');
  });

  it('returns only to the app’s own pages', () => {
    expect(returnPath({ from: '/read/abc?x=1#s' })).toBe('/read/abc?x=1#s');
    expect(returnPath({ from: '//evil.example/' })).toBe('/library');
    expect(returnPath({ from: 'https://evil.example/' })).toBe('/library');
    expect(returnPath({ from: '/pair' })).toBe('/library');
    expect(returnPath({ from: 42 })).toBe('/library');
    expect(returnPath(null)).toBe('/library');
  });
});
