// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The page a phone or tablet opens to pair with TTSNative in LAN mode (/pair).
 * Scope: Minimal chrome (no navigation: nothing else works before pairing). The code comes from the
 *   QR link (after `#`, so it never reaches a server log), which is dropped from the address at once,
 *   or is typed in (with or without the dash, any case). The device name is guessed from the browser
 *   and can be changed. After pairing it returns to the page that sent it here, or the library.
 *   If this device is paired already it says so; if its pairing stopped working (it ended, or the
 *   device's network address changed), it says why before asking for a new code. It says what works
 *   over LAN mode's plain HTTP, and that plain HTTP isn't secure against other devices nearby.
 * Does NOT belong: Showing codes or managing devices (features/settings/LanSection) or sending
 *   unpaired devices here (app/App.tsx).
 */
import { Link2 } from 'lucide-react';
import type { SubmitEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { describeError } from '@/api/client';
import type { ThisDevice } from '@/api/lanQueries';
import { usePairDevice, useThisDevice } from '@/api/lanQueries';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { usePageTitle } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { CODE_LENGTH, cleanCode, deviceName, formatCode, returnPath } from './pairing';

const TALL = 'h-12 text-base'; // 48 px controls; 16 px text so phones don't zoom in
const WHY = {
  expired:
    'Pairings last up to 30 days, and end sooner if the device isn’t used for 14 days. Show a new code on the computer to pair again.',
  address_changed:
    'This device’s network address changed. TTSNative only accepts a device from the address it paired from, so that a cookie copied off the network doesn’t work anywhere else. Show a new code on the computer to pair again.',
} as const;

/** Why this device's pairing stopped working, when the server knows. */
function PairAgain({ reason }: Readonly<{ reason: ThisDevice['reason'] }>) {
  if (!reason) return null;
  return (
    <Banner
      tone="info"
      title={reason === 'expired' ? 'Its pairing has ended' : 'Pair this device again'}
    >
      {WHY[reason]}
    </Banner>
  );
}

function PairForm({ initialCode, returnTo }: Readonly<{ initialCode: string; returnTo: string }>) {
  const pair = usePairDevice();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(() => deviceName(navigator.userAgent, navigator.maxTouchPoints));
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = cleanCode(code);
    if (clean.length !== CODE_LENGTH) {
      setProblem('Enter the 8-character code shown on the computer.');
      return;
    }
    setProblem(null);
    const label = name.trim() || 'Phone or tablet';
    pair.mutate(
      { code: formatCode(clean), name: label },
      {
        onSuccess: () => {
          toast.notify('success', 'Paired', `${label} can now use TTSNative.`);
          void navigate(returnTo, { replace: true });
        },
        onError: (error) => setProblem(describeError(error)),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Pairing code" hint="8 characters, shown in Settings → Phones and tablets.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            placeholder="XXXX-XXXX"
            className={`${TALL} font-mono tracking-[0.12em] uppercase`}
          />
        )}
      </Field>
      <Field
        label="Name for this device"
        hint="Shown on the computer, so you can tell devices apart."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={60}
            className={TALL}
          />
        )}
      </Field>
      {problem ? <Banner tone="error">{problem}</Banner> : null}
      <Button type="submit" variant="primary" size="lg" loading={pair.isPending}>
        Pair this device
      </Button>
    </form>
  );
}

export default function PairPage() {
  usePageTitle('Pair this device');
  const location = useLocation();
  const navigate = useNavigate();
  const device = useThisDevice();
  const [initialCode] = useState(() => formatCode(cleanCode(location.hash)));
  const returnTo = returnPath(location.state);

  useEffect(() => {
    // The code has been read: drop it from the address bar and the history entry.
    if (location.hash) {
      void navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: location.state },
      );
    }
  }, [location, navigate]);

  return (
    <main className="flex min-h-dvh justify-center bg-bg px-4 py-8 sm:py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-9" />
          <p className="text-[17px] font-bold tracking-tight">
            TTS<span className="text-accent-text">Native</span>
          </p>
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Link2 size={22} aria-hidden="true" className="text-accent-text" />
            Pair this device
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            On the computer running TTSNative, open Settings → Phones and tablets and turn on LAN
            mode. Then scan its QR code, or enter the code it shows.
          </p>
        </div>
        {device.data?.paired ? (
          <div className="flex flex-col gap-4">
            <Banner tone="success" title="This device is paired">
              It&apos;s paired as {device.data.name}.
            </Banner>
            <Link to={returnTo} replace className={buttonClasses('primary', 'lg')}>
              {returnTo === '/library' ? 'Open your library' : 'Continue'}
            </Link>
          </div>
        ) : (
          <>
            <PairAgain reason={device.data?.reason} />
            <PairForm initialCode={initialCode} returnTo={returnTo} />
          </>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          Pairing keeps a cookie on this device so TTSNative recognises it, for up to 30 days and
          only from this device&apos;s network address. It can be removed at any time on the
          computer. Traffic on your network isn&apos;t encrypted, so it isn&apos;t secure against
          other devices on the same network: only pair on networks you trust, such as your home
          Wi-Fi.
        </p>
        <p className="text-[13px] leading-relaxed text-muted">
          On this device, reading and listening work over LAN mode. Recording with the microphone,
          installing TTSNative as an app and screens that open without the computer need a secure
          (HTTPS) page, which LAN mode doesn&apos;t use.
        </p>
      </div>
    </main>
  );
}
