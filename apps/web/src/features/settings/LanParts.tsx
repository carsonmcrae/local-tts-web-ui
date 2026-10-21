// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The pieces of the "Phones and tablets" (LAN mode) settings.
 * Scope: What LAN mode shares and what stays on this computer (shown before the switch), the
 *   pairing card (the address to open, the QR code, the code in large type with a live countdown and
 *   a new code), the paired devices with removal behind a confirmation, the notes on the microphone,
 *   installing as an app and the development server, and the error explanations.
 * Does NOT belong: Loading or saving (LanSection.tsx, api/lanQueries.ts) or the pairing page on the
 *   phone (features/lan/PairPage.tsx).
 */
import { ClipboardCopy, Lock, MicOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ApiError } from '@/api/client';
import { describeError } from '@/api/client';
import type { LanDevice, LanStatus } from '@/api/lanQueries';
import { useNewPairingCode, useRemoveAllDevices, useRemoveDevice } from '@/api/lanQueries';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Banner, StatusRegion } from '@/components/ui/Feedback';
import { formatClock } from '@/lib/format';
import { timeAgo, useCopy } from './SpeechApiParts';

const MOBILE_TARGET = 'max-sm:h-11'; // 44 px touch targets on phones
const NOTE = 'text-[13px] leading-relaxed text-muted';

export function WhatLanModeShares() {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <p>
        Turn this on to read and listen on a phone or tablet on the same Wi-Fi. Each device pairs
        once with a code shown here. A paired device can open your library, read and listen, change
        reading settings, add documents and run exports.
      </p>
      <p>
        It can&apos;t change these settings, record or manage voices, install engines, import web
        pages or delete documents. Those stay on this computer.
      </p>
      <ul className={`flex flex-col gap-1.5 ${NOTE}`}>
        <li>
          Traffic is plain HTTP on your network, not encrypted. Only use LAN mode on networks you
          trust, such as your home Wi-Fi.
        </li>
        <li>
          Nothing is opened on your router (no port forwarding or UPnP), so only devices on your own
          network can reach it. Your computer&apos;s firewall may ask whether to allow TTSNative or
          Python on private networks.
        </li>
        <li>
          LAN mode turns itself off when TTSNative restarts. Paired devices stay paired until you
          remove them.
        </li>
      </ul>
    </div>
  );
}

/** The development server (Vite) doesn't serve the app on the LAN address; the built app does. */
export function DevelopmentNote() {
  return (
    <Banner tone="warning" title="This is the development server">
      A phone opening the LAN address reaches TTSNative&apos;s server, which only serves the app
      when it was started with --static, as npm start and the packaged app do. Under npm run dev it
      doesn&apos;t, so try LAN mode with npm start.
    </Banner>
  );
}

const HINTS = new Map([
  ['lan_no_network', 'Connect this computer to Wi-Fi or a network cable, then try again.'],
  ['lan_port_busy', 'Close the other program, or restart TTSNative on a different port.'],
  ['lan_address', 'The network may have changed. Choose an address from the list and try again.'],
]);

export function LanProblem({ error }: Readonly<{ error: Error }>) {
  const hint = HINTS.get(String((error as Partial<ApiError>).code));
  return (
    <Banner tone="error" title="LAN mode didn't change">
      {describeError(error)}
      {hint ? ` ${hint}` : ''}
    </Banner>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The pairing code, read out one character at a time by screen readers. */
function LargeCode({ code }: Readonly<{ code: string }>) {
  return (
    <p className="font-mono text-[28px] leading-tight font-semibold tracking-[0.12em] sm:text-[32px]">
      <span aria-hidden="true">{code}</span>
      <span className="sr-only">{code.split('').join(' ')}</span>
    </p>
  );
}

export function PairingCard({
  pairing,
  url,
  updatedAt,
}: Readonly<{ pairing: LanStatus['pairing']; url: string; updatedAt: number }>) {
  const newCode = useNewPairingCode();
  const copy = useCopy();
  const now = useNow(1000);
  const left = pairing ? Math.round((updatedAt + pairing.expiresInS * 1000 - now) / 1000) : 0;
  const live = pairing !== null && left > 0;
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-line bg-surface-2 p-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Pair a phone or tablet</h3>
        <p className="text-[13px] text-muted">
          On the device, scan the QR code with the camera, or open this address and enter the code:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-[15px] font-medium break-all">{url}</code>
          <Button
            size="sm"
            variant="ghost"
            className={MOBILE_TARGET}
            icon={<ClipboardCopy size={14} />}
            onClick={() => copy(url, 'Address copied')}
          >
            Copy address
          </Button>
        </div>
      </div>
      {live ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <img
            src={`/api/lan/pairing/qr.svg?v=${pairing.code}`}
            alt={`QR code that opens ${url}/pair with the pairing code ${pairing.code}`}
            width={176}
            height={176}
            className="size-44 shrink-0 rounded-[var(--radius-md)] bg-white p-1.5"
          />
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-muted">Pairing code</p>
            <LargeCode code={pairing.code} />
            <p className="text-[13px] text-muted">
              Expires in{' '}
              <span className="font-medium text-text tabular-nums">{formatClock(left)}</span>. It
              works once.
            </p>
            <Button
              size="sm"
              className={`self-start ${MOBILE_TARGET}`}
              loading={newCode.isPending}
              onClick={() => newCode.mutate()}
            >
              New code
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <StatusRegion className="text-sm">The code has expired or was used.</StatusRegion>
          <Button
            variant="primary"
            className={MOBILE_TARGET}
            loading={newCode.isPending}
            onClick={() => newCode.mutate()}
          >
            Show a new code
          </Button>
        </div>
      )}
      {newCode.isError ? <Banner tone="error">{describeError(newCode.error)}</Banner> : null}
    </div>
  );
}

function pairedLine(device: LanDevice, now: number): string {
  const paired = new Date(device.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const seen = device.lastSeenAt ? `last seen ${timeAgo(device.lastSeenAt, now)}` : 'not used yet';
  return `Paired ${paired}, ${seen}.`;
}

export function PairedDevices({
  devices,
  now,
}: Readonly<{ devices: readonly LanDevice[]; now: number }>) {
  const remove = useRemoveDevice();
  const removeAll = useRemoveAllDevices();
  const [confirm, setConfirm] = useState<LanDevice | 'all' | null>(null);
  const done = { onSuccess: () => setConfirm(null) };
  const one = confirm !== null && confirm !== 'all' ? confirm : null;
  const failure = remove.error ?? removeAll.error;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Paired devices</h3>
      {devices.length === 0 ? <p className={NOTE}>No devices are paired yet.</p> : null}
      <ul className="flex flex-col">
        {devices.map((device) => (
          <li
            key={device.id}
            className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{device.name}</p>
              <p className="text-[13px] text-muted">{pairedLine(device, now)}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className={MOBILE_TARGET}
              aria-label={`Remove ${device.name}`}
              onClick={() => setConfirm(device)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {devices.length > 1 ? (
        <Button
          size="sm"
          className={`self-start ${MOBILE_TARGET}`}
          onClick={() => setConfirm('all')}
        >
          Remove all
        </Button>
      ) : null}
      {failure ? <Banner tone="error">{describeError(failure)}</Banner> : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={() => setConfirm(null)}
        title={one ? `Remove ${one.name}?` : 'Remove all paired devices?'}
        description={
          one
            ? 'It stops working with TTSNative at once. To use it again, pair it with a new code.'
            : 'Every paired phone and tablet stops working with TTSNative at once. Each needs a new code to pair again.'
        }
        confirmLabel={one ? 'Remove' : 'Remove all'}
        busy={remove.isPending || removeAll.isPending}
        onConfirm={() => (one ? remove.mutate(one.id, done) : removeAll.mutate(undefined, done))}
      />
    </div>
  );
}

export function LanNotes() {
  return (
    <div className={`flex flex-col gap-2 ${NOTE}`}>
      <p className="flex gap-2">
        <MicOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Recording a voice needs this computer (browsers only allow the microphone on a secure page);
        on a phone you can import a recording instead.
      </p>
      <p className="flex gap-2">
        <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Phones can&apos;t install TTSNative as an app or open it without a connection: browsers only
        allow that on a secure (HTTPS) page, and LAN mode uses plain HTTP. On this computer it
        works.
      </p>
    </div>
  );
}
