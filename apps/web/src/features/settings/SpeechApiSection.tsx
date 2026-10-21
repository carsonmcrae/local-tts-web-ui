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
import { describeError } from '@/api/client';
import { useSaveSpeechApi, useSpeechApi } from '@/api/speechApiQueries';
import type { SpeechApiSettingsInput, SpeechApiStatus } from '@/api/types';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { HOMEPAGE } from '@/lib/provenance';
import { CollapsibleSection, useSectionOpen } from './CollapsibleSection';
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
  const [open, setOpen] = useSectionOpen('speech-api');
  const enabled = Boolean(status.data?.enabled);
  return (
    <CollapsibleSection
      id="speech-api"
      title="Local speech API"
      description="For advanced users: let other programs on this computer read text aloud with TTSNative voices."
      badge={<Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>}
      toggleLabel="Speech API settings"
      summary={summary(status.data)}
      open={open}
      onOpenChange={setOpen}
    >
      {status.isPending ? <Skeleton className="h-40" /> : null}
      {status.isError ? <Banner tone="error">{describeError(status.error)}</Banner> : null}
      {status.data ? <SpeechApiPanel status={status.data} now={status.dataUpdatedAt} /> : null}
    </CollapsibleSection>
  );
}
