/**
 * Purpose: Check the microphone before a studio session.
 * Scope: Choose the input (labels appear once the browser has microphone permission), record an
 *   8-second check — two seconds of quiet, then one line — and show the server's verdict on level,
 *   background noise, clipping and brightness, with specific fixes.
 * Does NOT belong: Recording session takes (SessionRecorder).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, Square } from 'lucide-react';
import { describeError } from '@/api/client';
import { checkMicrophone } from '@/api/queries';
import type { QualityReport } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { listInputs } from '@/lib/audio/pcmRecorder';
import { encodeWav } from '@/lib/audio/wav';
import { IssueList } from '../IssueList';
import { LevelMeter } from '../LevelMeter';
import { useTakeRecorder } from './useTakeRecorder';

const CHECK_S = 8;
const QUIET_S = 2;
const LINE =
  'Six bright yellow jackets hung by the cottage door, swaying gently in the evening breeze.';

function CheckResult({ report }: Readonly<{ report: QualityReport }>) {
  if (report.issues.length === 0) {
    return (
      <Banner tone="success" title="Your microphone sounds good">
        Clear level, little background noise and a natural, full sound.
      </Banner>
    );
  }
  return <IssueList issues={report.issues} />;
}

export function MicCheckStep({
  deviceId,
  onDevice,
}: Readonly<{ deviceId: string; onDevice: (deviceId: string) => void }>) {
  // Labels (and sometimes the list itself) appear once the browser has microphone permission.
  const inputs = useQuery({ queryKey: ['audio-inputs'], queryFn: listInputs });
  const check = useMutation({ mutationFn: checkMicrophone });
  const take = useTakeRecorder(CHECK_S, (clip) => {
    check.mutate(encodeWav(clip.samples, clip.sampleRate, 24));
    void inputs.refetch();
  });

  return (
    <div className="flex flex-col gap-5">
      <Field label="Microphone" hint="Choose your USB or XLR microphone if it’s listed.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={deviceId}
            disabled={take.recording}
            onChange={(event) => onDevice(event.target.value)}
          >
            <option value="">System default</option>
            {(inputs.data ?? []).map((input) => (
              <option key={input.deviceId} value={input.deviceId}>
                {input.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-line p-5 text-center">
        <p className="text-sm text-muted" aria-live="polite">
          {take.recording && take.elapsed < QUIET_S ? 'Stay quiet for a moment…' : null}
          {take.recording && take.elapsed >= QUIET_S ? 'Now read the line aloud.' : null}
          {take.recording ? null : 'Press Check, stay quiet for two seconds, then read this line:'}
        </p>
        <p className="font-serif text-lg leading-relaxed">{LINE}</p>
        {take.recording ? <LevelMeter level={take.level} /> : null}
        {take.recording ? (
          <Button
            variant="danger"
            icon={<Square size={14} fill="currentColor" />}
            onClick={() => void take.stop()}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={<Mic size={16} />}
            loading={check.isPending}
            onClick={() => void take.start(deviceId || undefined)}
          >
            Check microphone
          </Button>
        )}
      </div>
      {take.error ? <Banner tone="error">{take.error}</Banner> : null}
      {check.isError ? <Banner tone="error">{describeError(check.error)}</Banner> : null}
      {check.data && !take.recording ? <CheckResult report={check.data} /> : null}
    </div>
  );
}
