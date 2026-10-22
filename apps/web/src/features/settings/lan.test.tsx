// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for "Phones and tablets" (LAN mode) in Settings.
 * Scope: What it shares (said before the switch), turning it on (the address picker, the QR code
 *   with the code in its text alternative, the large code, the countdown and a new code), the
 *   trusted-network confirmation on macOS and Linux and Windows' category, an expired code, removing
 *   one or all paired devices after a confirmation, turning it off, why it turned itself off, the
 *   errors explained, polling only while open and on, the development-server note, what works over
 *   plain HTTP, the phone's view and the settings index entry.
 * Does NOT belong: Pairing on the phone (features/lan/pair.test.tsx).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LanDevice, LanStatus, LanUpdate, NetworkAddress } from '@/api/lanQueries';
import { json, mockApi, preferences, renderWithApp } from '@/test/render';
import { LanSection } from './LanSection';
import SettingsPage from './SettingsPage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const URL_ON = 'http://192.168.1.20:8765';
const device = (id: string, name: string, lastSeenAt: string | null = null, more: Partial<LanDevice> = {}): LanDevice => ({
  id: id.repeat(32), name, createdAt: '2026-10-19T10:00:00+00:00', lastSeenAt, address: '192.168.1.50',
  expiresAt: '2026-11-18T10:00:00+00:00', expired: false, ...more,
}); // prettier-ignore
const net = (address: string, name = 'Wi-Fi', kind: NetworkAddress['kind'] = 'network'): NetworkAddress => ({
  address, interface: name, kind,
}); // prettier-ignore
const off = (overrides: Partial<LanStatus> = {}): LanStatus => ({
  enabled: false, address: null, interface: null, port: null, url: null, addresses: [net('192.168.1.20')],
  devices: [], pairing: null, networkCheck: 'category', category: null, ...overrides,
}); // prettier-ignore
const on = (overrides: Partial<LanStatus> = {}): LanStatus =>
  off({ enabled: true, address: '192.168.1.20', interface: 'Wi-Fi', port: 8765, url: URL_ON, pairing: { code: 'ABCD-EFGH', expiresInS: 300 }, ...overrides }); // prettier-ignore

function setup(
  initial: LanStatus,
  routes: Record<string, unknown> = {},
  page: ReactNode = <LanSection />,
) {
  let current = initial;
  const api = mockApi({
    'GET /api/lan': () => current,
    'PUT /api/lan': (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as LanUpdate;
      const keep = { addresses: current.addresses, devices: current.devices, networkCheck: current.networkCheck }; // prettier-ignore
      current = body.enabled
        ? on({ ...keep, address: body.address ?? null, url: `http://${body.address}:8765`,
            interface: keep.addresses.find((choice) => choice.address === body.address)?.interface ?? null }) // prettier-ignore
        : off(keep);
      return current;
    },
    'POST /api/lan/pairing': () => {
      current = { ...current, pairing: { code: 'WXYZ-2345', expiresInS: 300 } };
      return current.pairing;
    },
    'DELETE /api/lan/devices/': (url: URL) => {
      const id = url.pathname.split('/').pop();
      current = { ...current, devices: current.devices.filter((item) => item.id !== id) };
      return new Response(null, { status: 204 });
    },
    'DELETE /api/lan/devices': () => {
      current = { ...current, devices: [] };
      return new Response(null, { status: 204 });
    },
    ...routes,
  });
  const view = renderWithApp(page, { path: '/settings', route: '/settings' });
  const sent = (method: string) =>
    api.calls.filter((call) => call.method === method && call.path.startsWith('/api/lan'));
  // Typing waits on timers; with fake timers (the countdown tests) they must be moved on by hand.
  const user = userEvent.setup({
    advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined),
  });
  return { ...api, ...view, sent, user };
}

async function expand(user: ReturnType<typeof userEvent.setup>) {
  const section = await screen.findByRole('region', { name: 'Phones and tablets' });
  await user.click(within(section).getByRole('button', { name: /^LAN mode/ }));
  return section;
}

describe('Phones and tablets (LAN mode)', () => {
  it('says what it shares before the switch, then turns on with a QR code, the code and a countdown', async () => {
    const { sent, user } = setup(
      off({ addresses: [net('192.168.1.20'), net('10.0.0.5', 'Ethernet')] }),
    );
    const section = await screen.findByRole('region', { name: 'Phones and tablets' });
    expect(await within(section).findByText('Off. Only this computer can open TTSNative.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
    await expand(user);
    const shares = within(section).getByText(
      /A paired device can open your library, read and listen/,
    );
    const power = await within(section).findByRole('switch', { name: 'Turn on LAN mode' });
    expect(shares.compareDocumentPosition(power) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getByText(/can.t change these settings, record, play back or manage voice recordings/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/copy its cookie/)).toBeInTheDocument();
    expect(within(section).getByText(/plain HTTP on your network, not encrypted/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/no port forwarding or UPnP/)).toBeInTheDocument();
    expect(within(section).getByText(/turns itself off when TTSNative restarts/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/Needs HTTPS: recording with the microphone/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/Needs HTTPS: installing TTSNative as an app/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/Plain HTTP isn.t secure against other devices on your network/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/delete documents or exports, cancel an export or send one to/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByRole('checkbox')).not.toBeInTheDocument(); // Windows reads the category

    await user.selectOptions(within(section).getByLabelText('Network address'), '10.0.0.5');
    expect(sent('PUT')).toHaveLength(0); // choosing while off only picks it
    await user.click(power);
    await waitFor(() => expect(power).toBeChecked());
    expect(JSON.parse(String(sent('PUT')[0]?.body))).toEqual({
      enabled: true,
      address: '10.0.0.5',
      trustedNetwork: false,
    });
    const qr = await within(section).findByRole('img', { name: /pairing code ABCD-EFGH/ });
    expect(qr).toHaveAttribute('src', '/api/lan/pairing/qr.svg?v=1'); // never the code itself
    expect(within(section).getByText('Open to devices on your network')).toBeInTheDocument();
    expect(within(section).getByText(/Any device on this computer.s Ethernet network can open/)).toBeInTheDocument(); // prettier-ignore
    expect(qr).toHaveAccessibleName('QR code that opens http://10.0.0.5:8765/pair with the pairing code ABCD-EFGH'); // prettier-ignore
    expect(within(section).getByText('ABCD-EFGH')).toBeInTheDocument();
    expect(within(section).getByText('A B C D - E F G H')).toBeInTheDocument(); // read out one by one
    expect(within(section).getByText(/^(5:00|4:59)$/)).toBeInTheDocument();
    expect(within(section).getByText('http://10.0.0.5:8765')).toBeInTheDocument();
    expect(within(section).getByText('On')).toBeInTheDocument();
    expect(within(section).getByText('On at http://10.0.0.5:8765, 0 devices paired.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText('No devices are paired yet.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Copy address' }));
    expect(await screen.findByText('Address copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('http://10.0.0.5:8765');

    await user.click(within(section).getByRole('button', { name: 'New code' }));
    expect(await within(section).findByText('WXYZ-2345')).toBeInTheDocument();
    expect(within(section).getByRole('img', { name: /WXYZ-2345/ })).toHaveAttribute('src', '/api/lan/pairing/qr.svg?v=2'); // prettier-ignore
    expect(sent('POST')).toHaveLength(1);

    await user.selectOptions(within(section).getByLabelText('Network address'), '192.168.1.20');
    await waitFor(() => expect(sent('PUT')).toHaveLength(2)); // moving networks while on is at once
    expect(JSON.parse(String(sent('PUT')[1]?.body))).toEqual({ enabled: true, address: '192.168.1.20', trustedNetwork: false }); // prettier-ignore
  });

  it('counts down and offers a new code once the code expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = setup(on({ pairing: { code: 'ABCD-EFGH', expiresInS: 2 } }));
    const section = await expand(user);
    expect(await within(section).findByText(/^0:0[12]$/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(await within(section).findByText('The code has expired or was used.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByRole('img')).not.toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Show a new code' }));
    expect(await within(section).findByText('WXYZ-2345')).toBeInTheDocument();
  });

  it('removes one paired device, then all of them, each after a confirmation', async () => {
    const devices = [device('a', 'Kitchen tablet'), device('b', 'iPhone', new Date(Date.now() - 300_000).toISOString()), device('c', 'Android phone')]; // prettier-ignore
    const { sent, user } = setup(on({ devices }));
    const section = await expand(user);
    expect(await within(section).findByText('Kitchen tablet')).toBeInTheDocument();
    expect(within(section).getAllByText(/from 192\.168\.1\.50, not used yet\. Pairing ends/)).toHaveLength(2); // prettier-ignore
    expect(within(section).getByText(/last seen 5 minutes ago\. Pairing ends/)).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Remove Kitchen tablet' }));
    const one = await screen.findByRole('dialog', { name: 'Remove Kitchen tablet?' });
    expect(one).toHaveTextContent('It stops working with TTSNative at once.');
    await user.click(within(one).getByRole('button', { name: 'Cancel' }));
    expect(sent('DELETE')).toHaveLength(0);
    await user.click(within(section).getByRole('button', { name: 'Remove Kitchen tablet' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' })); // prettier-ignore
    await waitFor(() => expect(within(section).queryByText('Kitchen tablet')).not.toBeInTheDocument()); // prettier-ignore
    expect(sent('DELETE').map((call) => call.path)).toEqual([`/api/lan/devices/${'a'.repeat(32)}`]);

    await user.click(within(section).getByRole('button', { name: 'Remove all' }));
    const all = await screen.findByRole('dialog', { name: 'Remove all paired devices?' });
    await user.click(within(all).getByRole('button', { name: 'Remove all' }));
    expect(await within(section).findByText('No devices are paired yet.')).toBeInTheDocument();
    expect(sent('DELETE').map((call) => call.path)).toContain('/api/lan/devices');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('turns off at once', async () => {
    vi.stubEnv('DEV', false);
    const { sent, user } = setup(on({ pairing: null, devices: [device('a', 'Kitchen tablet')] }));
    const section = await expand(user);
    expect(await within(section).findByText('The code has expired or was used.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByText('This is the development server')).not.toBeInTheDocument();
    await user.click(await within(section).findByRole('button', { name: 'Turn off LAN mode' }));
    await waitFor(() => expect(within(section).getByRole('switch')).not.toBeChecked());
    expect(JSON.parse(String(sent('PUT')[0]?.body))).toEqual({ enabled: false, address: null, trustedNetwork: false }); // prettier-ignore
    expect(within(section).queryByRole('img')).not.toBeInTheDocument();
    expect(within(section).getByText('Off')).toBeInTheDocument();
    expect(within(section).getByText('Kitchen tablet')).toBeInTheDocument(); // still paired
  });

  it.each([
    ['lan_no_network', "This computer isn't connected to a local network.", /Connect this computer to Wi-Fi/, []],
    ['lan_port_busy', "Couldn't listen on 192.168.1.20:8765; another program may be using it.", /Close the other program/, ['192.168.1.20']],
    ['lan_address', "That address isn't one of this computer's network addresses.", /The network may have changed/, ['192.168.1.20']],
    ['lan_not_started', "The network listener didn't start.", /^The network listener didn't start\.$/, ['192.168.1.20']],
    ['lan_public_network', 'Windows lists the network on Wi-Fi as a public network, so LAN mode stays off.', /^Windows lists the network on Wi-Fi as a public network, so LAN mode stays off.$/, ['192.168.1.20']],
    ['lan_network_unknown', "TTSNative couldn't read whether Windows treats the network on Wi-Fi as private or public.", /^TTSNative couldn't read whether Windows treats/, ['192.168.1.20']],
  ])('explains %s', async (code, message, hint, addresses) => {
    const { sent, user } = setup(off({ addresses: addresses.map((a) => net(a)) }), { 'PUT /api/lan': json({ error: { code, message } }, 409) });
    const section = await expand(user);
    await user.click(await within(section).findByRole('switch', { name: 'Turn on LAN mode' }));
    const alert = await within(section).findByRole('alert');
    expect(alert).toHaveTextContent("LAN mode didn't change");
    expect(alert).toHaveTextContent(message);
    expect(within(alert).getByText(hint)).toBeInTheDocument();
    expect(JSON.parse(String(sent('PUT')[0]?.body))).toEqual({ enabled: true, address: addresses[0] ?? null, trustedNetwork: false });
    await waitFor(() => expect(sent('GET')).toHaveLength(2)); // the status is checked again
  }); // prettier-ignore

  it('reports a new code or a removal that failed', async () => {
    const { user } = setup(on({ devices: [device('a', 'Kitchen tablet')] }), {
      'POST /api/lan/pairing': json({ error: { code: 'lan_off', message: 'Turn on LAN mode first.' } }, 409), // prettier-ignore
      'DELETE /api/lan/devices/': json({ error: { code: 'device_not_found', message: "That device isn't paired." } }, 404), // prettier-ignore
    });
    const section = await expand(user);
    await user.click(await within(section).findByRole('button', { name: 'New code' }));
    expect(await within(section).findByText('Turn on LAN mode first.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Remove Kitchen tablet' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' })); // prettier-ignore
    expect(await within(section).findByText("That device isn't paired.")).toBeInTheDocument();
  });

  it('polls for newly paired devices only while open and on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { sent, user } = setup(on());
    const section = await screen.findByRole('region', { name: 'Phones and tablets' });
    await within(section).findByText(/^On at /);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(sent('GET')).toHaveLength(1); // closed: no polling
    await user.click(within(section).getByRole('button', { name: /^LAN mode/ }));
    await act(() => vi.advanceTimersByTimeAsync(3100));
    await waitFor(() => expect(sent('GET')).toHaveLength(2));
    await user.click(within(section).getByRole('button', { name: /^LAN mode/ }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(sent('GET')).toHaveLength(2);
  });

  it('says when this computer has no network, and in development that phones need the built app', async () => {
    vi.stubEnv('DEV', true);
    const { user } = setup(off({ addresses: [] }));
    const section = await expand(user);
    expect(await within(section).findByText(/doesn.t seem to be connected to a local network/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByLabelText('Network address')).not.toBeInTheDocument();
    expect(within(section).getByText('This is the development server')).toBeInTheDocument();
    expect(within(section).getByText(/only serves the app\s+when it was started with --static/)).toBeInTheDocument(); // prettier-ignore
  });

  it('on a phone or tablet, says this is managed on the computer', async () => {
    const refused = json({ error: { code: 'not_allowed_remotely', message: 'Do this on the computer running TTSNative.' } }, 403); // prettier-ignore
    const { user } = setup(off(), { 'GET /api/lan': refused });
    const section = await expand(user);
    expect(await within(section).findByText('Phones and tablets are managed on the computer running TTSNative.')).toBeInTheDocument(); // prettier-ignore
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(section).getByText('What works over LAN mode (plain HTTP)')).toBeInTheDocument();
    expect(
      within(section).getByText(/Works: reading and listening, bookmarks/),
    ).toBeInTheDocument();
    expect(within(section).getByText(/Needs HTTPS: recording with the microphone/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/its screens opening while the computer/)).toBeInTheDocument();
  });

  it('shows other failures to load as they are, and is listed in the settings index', async () => {
    const broken = json({ error: { code: 'internal', message: 'Something broke.' } }, 500);
    const { user } = setup(off(), { 'GET /api/lan': broken, 'GET /api/preferences': preferences }, <SettingsPage />); // prettier-ignore
    const index = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(within(index).getByRole('link', { name: 'Phones & tablets' })).toHaveAttribute('href', '#lan'); // prettier-ignore
    const section = await expand(user);
    expect(await within(section).findByRole('alert')).toHaveTextContent('Something broke.');
    expect(within(section).queryByText('What works over LAN mode (plain HTTP)')).not.toBeInTheDocument(); // prettier-ignore
  });

  it('labels virtual and VPN adapters, warns about them and never picks a VPN by itself', async () => {
    const vpn = net('10.8.0.2', 'WireGuard', 'vpn');
    const { sent, user } = setup(
      off({ addresses: [net('192.168.2.4', 'vEthernet (External)', 'virtual'), vpn] }),
    );
    const section = await expand(user);
    const picker = await within(section).findByLabelText('Network address');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '192.168.2.4, vEthernet (External) (virtual adapter)', '10.8.0.2, WireGuard (VPN)',
    ]); // prettier-ignore
    expect(picker).toHaveValue('192.168.2.4');
    expect(within(section).getByText(/It can be your real network \(a Hyper-V switch/)).toBeInTheDocument(); // prettier-ignore
    await user.selectOptions(picker, '10.8.0.2');
    expect(within(section).getByText(/may be outside your home, could reach TTSNative/)).toBeInTheDocument(); // prettier-ignore
    await user.click(within(section).getByRole('switch', { name: 'Turn on LAN mode' }));
    await waitFor(() => expect(sent('PUT')).toHaveLength(1));
    expect(JSON.parse(String(sent('PUT')[0]?.body))).toEqual({
      enabled: true,
      address: '10.8.0.2',
      trustedNetwork: false,
    });
  });

  it('shows a single virtual adapter with its label, and says why LAN mode turned itself off', async () => {
    const { user } = setup(off({ addresses: [net('192.168.137.1', 'Local Area Connection* 10', 'virtual')], turnedOff: 'network_changed' })); // prettier-ignore
    const section = await expand(user);
    expect(await within(section).findByText('LAN mode turned itself off')).toBeInTheDocument();
    expect(within(section).getByText(/network changed, or it was asleep/)).toBeInTheDocument();
    expect(within(section).getByRole('option')).toHaveTextContent('Local Area Connection* 10 (virtual adapter)'); // prettier-ignore
  });

  it('on macOS and Linux, asks every time to confirm a home network the person trusts', async () => {
    const refusal = { code: 'lan_confirm_network', message: 'Confirm that this computer is on a home network you trust.' }; // prettier-ignore
    let current = off({ networkCheck: 'confirm' });
    const { sent, user } = setup(current, {
      'GET /api/lan': () => current,
      'PUT /api/lan': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as LanUpdate;
        if (body.enabled && !body.trustedNetwork) return json({ error: refusal }, 409);
        current = body.enabled ? on({ networkCheck: 'confirm' }) : off({ networkCheck: 'confirm' });
        return current;
      },
    });
    const section = await expand(user);
    const power = await within(section).findByRole('switch', { name: 'Turn on LAN mode' });
    const trusted = within(section).getByRole('checkbox', { name: 'This is a home network I trust, such as my own Wi-Fi' }); // prettier-ignore
    expect(within(section).getByText(/Asked every time LAN mode is turned on/)).toBeInTheDocument();
    await user.click(power);
    const alert = await within(section).findByRole('alert');
    expect(alert).toHaveTextContent('Confirm that this computer is on a home network you trust.');
    expect(alert).toHaveTextContent('Tick “This is a home network I trust”, then turn it on.');
    expect(JSON.parse(String(sent('PUT')[0]?.body))).toEqual({ enabled: true, address: '192.168.1.20', trustedNetwork: false }); // prettier-ignore
    await user.click(trusted);
    await user.click(power);
    await waitFor(() => expect(power).toBeChecked());
    expect(JSON.parse(String(sent('PUT')[1]?.body))).toEqual({ enabled: true, address: '192.168.1.20', trustedNetwork: true }); // prettier-ignore
    expect(within(section).queryByText(/Windows lists it/)).not.toBeInTheDocument();
    expect(trusted).toBeChecked(); // still ticked while it is on
    await user.click(power); // off: the next time is a new session, asked again
    await waitFor(() => expect(power).not.toBeChecked());
    expect(trusted).not.toBeChecked();
    await user.click(power);
    expect(await within(section).findByRole('alert')).toHaveTextContent('Confirm that this computer'); // prettier-ignore
    expect(JSON.parse(String(sent('PUT')[3]?.body))).toEqual({ enabled: true, address: '192.168.1.20', trustedNetwork: false }); // prettier-ignore
  });

  it('says what Windows calls the network while LAN mode is on', async () => {
    const old = device('a', 'Old phone', null, { address: null }); // paired before addresses were kept
    const { user } = setup(on({ category: 'private', interface: null, devices: [old] }));
    const section = await expand(user);
    expect(await within(section).findByText(/Windows lists it as a private network/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/so other devices on the network could read it/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/^Any device on this network can open/)).toBeInTheDocument();
    expect(within(section).getByText(/^Paired [^f]*, not used yet/)).toBeInTheDocument(); // no "from"
  });

  it.each([
    [
      'network_public',
      /Windows now lists this network as public, so TTSNative stopped listening on it/,
    ],
    ['network_unknown', /couldn.t confirm in Windows that this network is still private/],
  ] as const)('says LAN mode turned itself off because of %s', async (turnedOff, why) => {
    const { user } = setup(off({ turnedOff }));
    const section = await expand(user);
    expect(await within(section).findByText('LAN mode turned itself off')).toBeInTheDocument();
    expect(within(section).getByText(why)).toBeInTheDocument();
  });

  it('shows where each device paired from, a refused use of its cookie and an ended pairing', async () => {
    const minutesAgo = new Date(Date.now() - 180_000).toISOString();
    const devices = [
      device('a', 'Kitchen tablet', minutesAgo, {
        refusedAddress: '192.168.1.77',
        refusedAt: minutesAgo,
      }),
      device('b', 'Old phone', null, { expired: true }),
    ];
    const { user } = setup(on({ devices }));
    const section = await expand(user);
    expect(await within(section).findByText(/Refused 3 minutes ago: its cookie was used from 192\.168\.1\.77/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/someone on the network may have copied it: remove it/)).toBeInTheDocument(); // prettier-ignore
    expect(within(section).getByText(/from 192\.168\.1\.50\. Its pairing has ended: pair it again\./)).toBeInTheDocument(); // prettier-ignore
  });
});
