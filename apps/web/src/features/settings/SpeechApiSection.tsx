// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The optional local speech API in Settings, for advanced users.
 * Scope: A collapsed section (an On/Off badge and a one-line summary; a link to #speech-api opens it)
 *   with the on/off switch, the access token, how it is being used, an example command, the custom
 *   voices programs may use, the network permission and the limits. Every change is saved at once;
 *   failures are reported in a toast.
 * Does NOT belong: The pieces themselves (SpeechApiParts.tsx) or the server's checks.
 */
import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useLocation } from 'react-router';
import { describeError } from '@/api/client';
import { useSaveSpeechApi, useSpeechApi } from '@/api/speechApiQueries';
import type { SpeechApiSettingsInput, SpeechApiStatus } from '@/api/types';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { HOMEPAGE } from '@/lib/provenance';
import {
  AllowedVoices,
  CurlExample,
  NetworkPermission,
  TokenControls,
  UsageLine,
} from './SpeechApiParts';

const GUIDE = `${HOMEPAGE}/blob/main/docs/guides/local-speech-api.md`;

function summary(status: SpeechApiStatus | undefined): string {
  if (!status) return 'For scripts, screen readers and home automation.';
  if (!status.enabled) return "Off. Programs on this computer can't use your voices.";
  return status.hasToken ? 'On.' : 'On, but programs need a token to connect.';
}

function SpeechApiPanel({ status, now }: Readonly<{ status: SpeechApiStatus; now: number }>) {
  const save = useSaveSpeechApi();
  const toast = useToast();
  const failed = (error: unknown) =>
    toast.notify('error', "The speech API settings didn't change", describeError(error));
  const change = (changes: Partial<SpeechApiSettingsInput>) =>
    save.mutate(
      {
        enabled: status.enabled,
        allowNetwork: status.allowNetwork,
        allowedVoices: [...status.allowedVoices],
        ...changes,
      },
      { onError: failed },
    );
  return (
    <>
      <div className="flex min-h-11 flex-col justify-center">
        <Switch
          label="Turn on the speech API"
          description="Adds an OpenAI-compatible endpoint, /v1/audio/speech, for programs on this computer. While it is off, the endpoint doesn't exist."
          checked={status.enabled}
          onCheckedChange={(enabled) => change({ enabled })}
        />
      </div>
      <UsageLine status={status} now={now} />
      <TokenControls status={status} onError={failed} />
      <CurlExample port={status.port} />
      <AllowedVoices
        allowed={status.allowedVoices}
        onChange={(allowedVoices) => change({ allowedVoices })}
      />
      <NetworkPermission status={status} onChange={(allowNetwork) => change({ allowNetwork })} />
      <p className="text-[13px] leading-relaxed text-muted">
        Up to {status.maxInputChars.toLocaleString()} characters a request,{' '}
        {status.requestsPerMinute} requests a minute and one request at a time. Web pages can&apos;t
        call it, and nothing is sent outside this computer.{' '}
        <a
          href={GUIDE}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Read the guide
        </a>
      </p>
    </>
  );
}

export function SpeechApiSection() {
  const status = useSpeechApi();
  const { hash } = useLocation();
  const [open, setOpen] = useState(hash === '#speech-api'); // opened by a link to it, such as the in-use sign
  const regionId = useId();
  const enabled = Boolean(status.data?.enabled);
  return (
    <Section
      id="speech-api"
      title="Local speech API"
      description="For advanced users: let other programs on this computer read text aloud with TTSNative voices."
      actions={<Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        className="group flex min-h-11 w-full items-start gap-2 rounded-[var(--radius-md)] py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="mt-px shrink-0 text-muted transition-transform group-aria-expanded:rotate-90"
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium">Speech API settings</span>
          <span className="text-[13px] text-muted">{summary(status.data)}</span>
        </span>
      </button>
      {open ? (
        <div id={regionId} className="mt-4 flex flex-col gap-6 border-t border-line pt-4">
          {status.isPending ? <Skeleton className="h-40" /> : null}
          {status.isError ? <Banner tone="error">{describeError(status.error)}</Banner> : null}
          {status.data ? <SpeechApiPanel status={status.data} now={status.dataUpdatedAt} /> : null}
        </div>
      ) : null}
    </Section>
  );
}
