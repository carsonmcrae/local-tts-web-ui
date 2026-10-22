// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The pieces of the local speech API settings.
 * Scope: The access token (create, replace or revoke after a confirmation; a new token is shown once
 *   with a copy button and is never shown again), the usage line (a polite live region), the address
 *   programs connect to (the server's own port, a warning when it differs from the one programs last
 *   used), an example curl command, which custom voices programs may use (none until allowed, with a
 *   note on consent), the "other devices on my network" permission with what turning it on would
 *   expose, and a coarse "… ago" formatter.
 * Does NOT belong: Loading or saving the settings (SpeechApiSection.tsx, api/speechApiQueries.ts).
 */
import { ClipboardCopy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useVoices } from '@/api/queries';
import { useCreateSpeechToken, useRevokeSpeechToken } from '@/api/speechApiQueries';
import type { SpeechApiStatus } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Banner, StatusRegion } from '@/components/ui/Feedback';
import { Checkbox, Input, Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { pluralize } from '@/lib/format';

const EXAMPLE_VOICE = 'kokoro:af_heart';
const MOBILE_TARGET = 'max-sm:h-11'; // 44 px touch targets on phones

/** "less than a minute ago", "5 minutes ago", "2 hours ago", "3 days ago". */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? format.format(-hours, 'hour') : format.format(-Math.floor(hours / 24), 'day');
}

export function useCopy() {
  const toast = useToast();
  return (text: string, done: string) =>
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => toast.notify('success', done))
      .catch(() => toast.notify('error', 'Copy failed', 'Select the text and copy it yourself.'));
}

function FreshToken({ token, onDone }: Readonly<{ token: string; onDone: () => void }>) {
  const copy = useCopy();
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft p-3">
      <StatusRegion className="text-sm font-medium">
        Copy your new token now. You won&apos;t see it again.
      </StatusRegion>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          aria-label="New API token"
          value={token}
          spellCheck={false}
          className={`font-mono text-[13px] ${MOBILE_TARGET}`}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          icon={<ClipboardCopy size={15} />}
          className={MOBILE_TARGET}
          onClick={() => copy(token, 'Token copied')}
        >
          Copy token
        </Button>
      </div>
      <p className="text-[13px] text-muted">
        Only a fingerprint of it is stored, so it can&apos;t be shown again. If you lose it, make a
        new one.
      </p>
      <Button variant="ghost" size="sm" className={`self-start ${MOBILE_TARGET}`} onClick={onDone}>
        I&apos;ve copied it
      </Button>
    </div>
  );
}

type TokenChange = 'replace' | 'revoke';
const CONFIRM: Record<TokenChange, { title: string; description: string; label: string }> = {
  replace: {
    title: 'Make a new token?',
    description: 'The current token stops working at once. Programs using it need the new one.',
    label: 'Make new token',
  },
  revoke: {
    title: 'Revoke the token?',
    description: 'Programs using it stop working at once. You can make a new token later.',
    label: 'Revoke',
  },
};

export function TokenControls({
  status,
  onError,
}: Readonly<{ status: SpeechApiStatus; onError: (error: unknown) => void }>) {
  const create = useCreateSpeechToken();
  const revoke = useRevokeSpeechToken();
  const toast = useToast();
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TokenChange | null>(null);
  const makeToken = () =>
    create.mutate(undefined, {
      onSuccess: (made) => {
        setConfirm(null);
        setFresh(made.token);
        create.reset(); // the token now lives only in this component
      },
      onError,
    });
  const revokeToken = () =>
    revoke.mutate(undefined, {
      onSuccess: () => {
        setConfirm(null);
        setFresh(null);
        toast.notify('success', 'Token revoked', 'Programs using it can no longer connect.');
      },
      onError,
    });
  const created = status.tokenCreatedAt ? new Date(status.tokenCreatedAt).toLocaleString() : '';
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <KeyRound size={15} aria-hidden="true" /> Access token
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">
          {status.hasToken
            ? `A token was made on ${created}. Programs send it as Authorization: Bearer <token>.`
            : 'No token yet. Programs need one to use the API.'}
        </p>
      </div>
      {fresh ? <FreshToken token={fresh} onDone={() => setFresh(null)} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={status.hasToken ? 'secondary' : 'primary'}
          className={MOBILE_TARGET}
          loading={create.isPending}
          onClick={() => (status.hasToken ? setConfirm('replace') : makeToken())}
        >
          {status.hasToken ? 'New token' : 'Create token'}
        </Button>
        {status.hasToken ? (
          <Button variant="ghost" className={MOBILE_TARGET} onClick={() => setConfirm('revoke')}>
            Revoke token
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={() => setConfirm(null)}
        title={CONFIRM[confirm ?? 'revoke'].title}
        description={CONFIRM[confirm ?? 'revoke'].description}
        confirmLabel={CONFIRM[confirm ?? 'revoke'].label}
        busy={create.isPending || revoke.isPending}
        onConfirm={confirm === 'replace' ? makeToken : revokeToken}
      />
    </div>
  );
}

export function UsageLine({ status, now }: Readonly<{ status: SpeechApiStatus; now: number }>) {
  const voices = useVoices();
  const { usage } = status;
  const voice = voices.data?.find((item) => item.id === usage.lastVoiceId)?.name;
  const withVoice = voice ? `, with ${voice}` : '';
  const last = usage.lastUsedAt
    ? `Last used ${timeAgo(usage.lastUsedAt, now)}${withVoice}.`
    : 'Not used since TTSNative started.';
  return (
    <StatusRegion label="Speech API use" className="text-sm">
      {usage.active ? <span className="font-medium text-accent-text">In use now. </span> : null}
      {last} {pluralize(usage.requests, 'request')} served.
    </StatusRegion>
  );
}

/** The base URL programs on this computer use: the server's own port, which the status reports. */
const apiBase = (port: number | null) => `http://127.0.0.1:${port ?? '<port>'}/v1`;

function MovedPort({ port, before }: Readonly<{ port: number; before: number }>) {
  return (
    <Banner tone="warning" title={`The speech API moved from port ${before} to port ${port}`}>
      A program last used port {before}. That port was probably busy when TTSNative started, so
      programs set up for it can&apos;t connect now. Change them to {apiBase(port)}, or close
      whatever is using port {before} and restart TTSNative. This note goes away once a program uses
      the new address.
    </Banner>
  );
}

export function ApiAddress({ status }: Readonly<{ status: SpeechApiStatus }>) {
  const copy = useCopy();
  const { port, lastUsedPort } = status;
  const base = apiBase(port);
  const pagePort = globalThis.location.port; // under npm run dev, the web dev server's, not the API's
  const notPagePort =
    port !== null && pagePort !== '' && pagePort !== String(port)
      ? `, not ${pagePort} as in your browser's address bar: under npm run dev, this page comes from a separate web server`
      : '';
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Address</h3>
      <p className="text-[13px] text-muted">Programs on this computer connect to:</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 font-mono text-[13px] break-all">
          {base}
        </code>
        <Button
          size="sm"
          className={`self-start sm:self-auto ${MOBILE_TARGET}`}
          icon={<ClipboardCopy size={14} />}
          disabled={port === null}
          onClick={() => copy(base, 'Address copied')}
        >
          Copy address
        </Button>
      </div>
      {status.enabled && port !== null && lastUsedPort !== null && lastUsedPort !== port ? (
        <MovedPort port={port} before={lastUsedPort} />
      ) : null}
      <p className="text-[13px] leading-relaxed text-muted">
        {port === null
          ? "TTSNative couldn't tell which port it listens on. Use the one it printed when it started."
          : `Port ${port} is where TTSNative listens now${notPagePort}. It stays the same until TTSNative restarts. If its usual port is busy when it starts, it uses the next free one, and programs set up with the old address can't connect until you change them; this section warns you when that happens.`}
      </p>
    </div>
  );
}

export function CurlExample({ port }: Readonly<{ port: number | null }>) {
  const copy = useCopy();
  const base = apiBase(port);
  const body = JSON.stringify({ model: 'ttsnative', voice: EXAMPLE_VOICE, input: 'Hello from TTSNative.' }); // prettier-ignore
  const command = `curl ${base}/audio/speech -H "Authorization: Bearer $TTSNATIVE_TOKEN" -H "Content-Type: application/json" -d '${body}' -o hello.mp3`;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Try it</h3>
      <p className="text-[13px] text-muted">
        Put the token in a TTSNATIVE_TOKEN environment variable, then run this in a terminal (on
        Windows PowerShell, type curl.exe):
      </p>
      <pre className="rounded-[var(--radius-md)] bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap">
        <code>{command}</code>
      </pre>
      <Button
        size="sm"
        className={`self-start ${MOBILE_TARGET}`}
        icon={<ClipboardCopy size={14} />}
        onClick={() => copy(command, 'Command copied')}
      >
        Copy command
      </Button>
      <p className="text-[13px] leading-relaxed text-muted">
        OpenAI clients work too: use the address above as the base URL and the token as the API key.
        They can keep OpenAI&apos;s voice names, such as alloy or nova, which read with built-in
        Kokoro voices. GET {base}/voices lists every voice id.
      </p>
    </div>
  );
}

export function AllowedVoices({
  allowed,
  onChange,
}: Readonly<{ allowed: readonly string[]; onChange: (allowed: string[]) => void }>) {
  const voices = useVoices();
  // Cloned voices (custom:…); other kinds of voice can't be allowed for the API.
  const custom = (voices.data ?? []).filter((voice) => voice.id.startsWith('custom:'));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Custom voices programs may use</legend>
      <p className="text-[13px] leading-relaxed text-muted">
        Built-in voices can be used while the API is on. A custom voice can&apos;t until you allow
        it here. Only allow a voice that is yours, or whose speaker agreed to this: any program with
        the token can make it say anything, so never use it to pass as someone else.
      </p>
      {custom.length === 0 ? (
        <p className="text-[13px] text-muted">You have no custom voices.</p>
      ) : null}
      {custom.map((voice) => (
        <div key={voice.id} className="flex min-h-11 items-center">
          <Checkbox
            label={`Allow ${voice.name}`}
            checked={allowed.includes(voice.id)}
            onCheckedChange={(checked) =>
              onChange(
                checked ? [...allowed, voice.id] : allowed.filter((item) => item !== voice.id),
              )
            }
          />
        </div>
      ))}
    </fieldset>
  );
}

export function NetworkPermission({
  status,
  onChange,
}: Readonly<{ status: SpeechApiStatus; onChange: (allowNetwork: boolean) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 flex-col justify-center">
        <Switch
          label="Allow other devices on my network"
          description="Off unless you turn it on."
          checked={status.allowNetwork}
          onCheckedChange={onChange}
        />
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        Turning this on lets phones, computers and smart speakers on your network that have the
        token make speech with these voices, including any custom voices allowed above. Requests
        travel as plain HTTP, so others on the same network could read the text and the token.{' '}
        {status.networkMode
          ? "Other devices can reach TTSNative now (LAN mode or network mode is on). They use this computer's network address in place of 127.0.0.1, with the same port."
          : 'TTSNative only listens on this computer right now, so this has no effect until you turn on LAN mode in Phones & tablets, or start it in network mode.'}
      </p>
      {status.allowNetwork ? (
        <Banner tone="warning">
          Other devices on your network that have the token can use the speech API.
        </Banner>
      ) : null}
    </div>
  );
}
