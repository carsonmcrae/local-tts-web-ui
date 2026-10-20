/**
 * Purpose: Review a captured clip, then name it and confirm consent.
 * Scope: `ReviewStep` — playback, instant local checks plus the server's authoritative checks, the
 *   cleanup controls (starting from the last cleanup used or the suggested one), retake;
 *   `DetailsStep` — profile name, the exact consent statement from the server, and what is stored.
 * Does NOT belong: Capture (CaptureStep) or creation/testing (CreateVoiceWizard).
 */
import { CheckCircle2, CircleAlert, RotateCcw, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api, describeError } from '@/api/client';
import { analyzeRecording } from '@/api/queries';
import type { Cleanup } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { analyzeSamples } from '@/lib/audio/analysis';
import { encodeWav } from '@/lib/audio/wav';
import type { CapturedClip } from './CaptureStep';
import { startingCleanup } from './cleanup';
import { CleanupPanel } from './CleanupPanel';
import { blobId, useDataUrl } from './useDataUrl';

const ICONS = {
  ok: <CheckCircle2 size={17} className="text-success" />,
  warning: <CircleAlert size={17} className="text-warning" />,
  error: <XCircle size={17} className="text-danger" />,
};

interface ReviewProps {
  clip: CapturedClip;
  onRetake: () => void;
  onVerdict: (ok: boolean, wav: Blob) => void;
  cleanup: Cleanup;
  onCleanup: (cleanup: Cleanup) => void;
}

function useServerAnalysis(wav: Blob) {
  const query = useQuery({
    queryKey: ['analyze', blobId(wav)],
    queryFn: () => analyzeRecording(wav),
    staleTime: Infinity,
    retry: false,
  });
  return { data: query.data, error: query.error, pending: query.isPending };
}

export function ReviewStep({
  clip,
  onRetake,
  onVerdict,
  cleanup,
  onCleanup,
}: Readonly<ReviewProps>) {
  const wav = useMemo(() => encodeWav(clip.samples, clip.sampleRate), [clip]);
  const audioUrl = useDataUrl(wav);
  const local = useMemo(() => analyzeSamples(clip.samples, clip.sampleRate), [clip]);
  const server = useServerAnalysis(wav);
  const report = server.data?.report ?? local;
  useEffect(() => onVerdict(Boolean(server.data?.report.ok), wav), [server.data, wav, onVerdict]);
  // Once the server has checked the clip, start from the last cleanup used or the suggested one.
  useEffect(() => {
    if (server.data) onCleanup(startingCleanup(server.data.suggested));
  }, [server.data, onCleanup]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line p-4">
        <p className="text-sm font-medium">Listen back</p>
        {/* The speaker's own recording of the passage shown in the previous step; no captions exist. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={audioUrl} className="w-full" aria-label="Your recording" />
        <p className="text-[13px] text-muted">
          {report.durationS.toFixed(1)} s total · {report.speechS.toFixed(1)} s of speech
          {clip.note ? ` · ${clip.note}` : ''}
        </p>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          Quality checks {server.pending ? <Spinner size={14} /> : null}
          <span className="text-xs font-normal text-subtle">
            {server.data ? 'verified by the local server' : 'instant preview'}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {report.issues.length === 0 ? (
            <li className="flex items-center gap-2 text-sm">
              {ICONS.ok} Clear, well-levelled speech. This should work well.
            </li>
          ) : (
            report.issues.map((issue) => (
              <li key={issue.code + issue.severity} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5">{ICONS[issue.severity]}</span>
                {issue.message}
              </li>
            ))
          )}
        </ul>
      </div>
      {server.error ? <Banner tone="error">{describeError(server.error)}</Banner> : null}
      {server.data ? (
        <CleanupPanel
          recording={wav}
          suggested={server.data.suggested}
          value={cleanup}
          onChange={onCleanup}
        />
      ) : null}
      <div>
        <Button icon={<RotateCcw size={15} />} onClick={onRetake}>
          Record again
        </Button>
      </div>
    </div>
  );
}

interface DetailsProps {
  name: string;
  onName: (name: string) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
}

export function DetailsStep({ name, onName, consent, onConsent }: Readonly<DetailsProps>) {
  const statement = useQuery({
    queryKey: ['consent'],
    queryFn: () => api<{ statement: string }>('/api/voice-profiles/consent'),
    staleTime: Infinity,
  });
  return (
    <div className="flex flex-col gap-5">
      <Field label="Voice name" hint="Shown in the voice picker. You can rename it later.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={name}
            maxLength={60}
            onChange={(event) => onName(event.target.value)}
            placeholder="e.g. My reading voice"
          />
        )}
      </Field>
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4">
        <p className="mb-3 text-sm font-medium">Permission</p>
        {statement.data ? (
          <Checkbox
            checked={consent}
            onCheckedChange={onConsent}
            label={statement.data.statement}
          />
        ) : (
          <Spinner />
        )}
      </div>
      <Banner tone="info" title="What gets stored">
        A trimmed copy of this recording (WAV) is saved in this app’s data folder on this computer.
        No model is trained, nothing is uploaded, and deleting the voice removes the recording and
        any audio generated with it.
      </Banner>
    </div>
  );
}
