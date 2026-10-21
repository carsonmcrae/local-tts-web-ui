// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Check the microphone before a studio session, hear it, and clean it up by ear.
 * Scope: Lists the inputs and picks the likeliest studio microphone until the speaker chooses one;
 *   records an 8-second check (two seconds of quiet, then one line); shows the server's verdict on
 *   level, noise, clipping and tone with fixes; and offers the cleanup controls (noise reduction,
 *   rumble filter, tone) starting from the speaker's last cleanup or the suggested one, with
 *   before-and-after playback.
 * Does NOT belong: Recording session takes (SessionRecorder) or applying the cleanup (the server).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { checkMicrophone } from '@/api/queries';
import type { Cleanup, RecordingCheck } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { listInputs, preferredInput } from '@/lib/audio/pcmRecorder';
import { encodeWav } from '@/lib/audio/wav';
import { startingCleanup } from '../cleanup';
import { CleanupPanel } from '../CleanupPanel';
import { IssueList } from '../IssueList';
import { LevelMeter } from '../LevelMeter';
import { useTakeRecorder } from './useTakeRecorder';

const CHECK_S = 8;
const QUIET_S = 2;
const LINE =
  'Six bright yellow jackets hung by the cottage door, swaying gently in the evening breeze.';

/** The verdict and the cleanup controls, with before-and-after playback. */
function CheckResult({
  result,
  recording,
  cleanup,
  onCleanup,
}: Readonly<{
  result: RecordingCheck;
  recording: Blob;
  cleanup: Cleanup;
  onCleanup: (cleanup: Cleanup) => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      {result.report.issues.length === 0 ? (
        <Banner tone="success" title="Your microphone sounds good">
          Clear level, little background noise and a natural, full tone. Listen back to be sure.
        </Banner>
      ) : (
        <IssueList issues={result.report.issues} />
      )}
      <CleanupPanel
        recording={recording}
        suggested={result.suggested}
        value={cleanup}
        onChange={onCleanup}
      />
    </div>
  );
}

export function MicCheckStep({
  deviceId,
  onDevice,
  cleanup,
  onCleanup,
}: Readonly<{
  /** The chosen input: null until the speaker or the automatic pick chooses one, '' for the system default. */
  deviceId: string | null;
  onDevice: (deviceId: string) => void;
  cleanup: Cleanup;
  onCleanup: (cleanup: Cleanup) => void;
}>) {
  // Labels (and sometimes the list itself) appear once the browser has microphone permission.
  const inputs = useQuery({ queryKey: ['audio-inputs'], queryFn: listInputs });
  const preferred = preferredInput(inputs.data ?? []);
  const [recording, setRecording] = useState<Blob | null>(null);
  const check = useMutation({
    mutationFn: checkMicrophone,
    onSuccess: (result) => onCleanup(startingCleanup(result.suggested)),
  });
  const take = useTakeRecorder(CHECK_S, (clip) => {
    const wav = encodeWav(clip.samples, clip.sampleRate, 24);
    setRecording(wav);
    check.mutate(wav);
    void inputs.refetch();
  });

  // Until the speaker picks one, use the input that looks most like a studio microphone.
  useEffect(() => {
    if (deviceId === null && preferred) onDevice(preferred.deviceId);
  }, [deviceId, preferred, onDevice]);

  return (
    <div className="flex flex-col gap-5">
      <Field label="Microphone" hint="Choose your USB or XLR microphone if it’s listed.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={deviceId ?? ''}
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
            {recording ? 'Check again' : 'Check microphone'}
          </Button>
        )}
      </div>
      {take.error ? (
        <Banner tone="error" title={take.error.message}>
          {take.error.hint}
        </Banner>
      ) : null}
      {check.isError ? <Banner tone="error">{describeError(check.error)}</Banner> : null}
      {check.data && recording && !take.recording ? (
        <CheckResult
          result={check.data}
          recording={recording}
          cleanup={cleanup}
          onCleanup={onCleanup}
        />
      ) : null}
    </div>
  );
}
