// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Record a studio session one passage at a time, each take checked and saved at once.
 * Scope: Passage navigation (starting at the first passage without a good take), record and stop with
 *   a live level meter, lossless 24-bit upload at the input's own rate, the take's verdict with
 *   fixes, moving on after a good take, progress towards the speech needed to build, and importing
 *   a long WAV/FLAC/OGG recording made in another app.
 * Does NOT belong: The microphone check or building the voice.
 */
import { ChevronLeft, ChevronRight, FileAudio, Mic, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeError } from '@/api/client';
import { useImportRecording, useSaveTake } from '@/api/queries';
import type { SessionTake, VoiceSession } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Banner, ProgressBar } from '@/components/ui/Feedback';
import { formatClock } from '@/lib/format';
import { encodeWav } from '@/lib/audio/wav';
import { IssueList } from '../IssueList';
import { LevelMeter } from '../LevelMeter';
import { PASSAGES } from './passages';
import { useTakeRecorder } from './useTakeRecorder';

const MAX_TAKE_S = 45;
const MAX_IMPORT_BYTES = 600 * 1024 * 1024;
const IMPORT_TYPES = /\.(wav|flac|ogg)$/i;

const minutes = (seconds: number) => (seconds / 60).toFixed(1);

function TakeVerdict({ take }: Readonly<{ take: SessionTake | undefined }>) {
  if (!take) return null;
  if (take.quality.issues.length === 0)
    return <Badge tone="success">Recorded · {take.durationS.toFixed(0)} s</Badge>;
  return <IssueList issues={take.quality.issues} />;
}

function SpeechProgress({ session }: Readonly<{ session: VoiceSession }>) {
  const ready = session.usableSpeechS >= session.requiredSpeechS;
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={session.usableSpeechS / session.requiredSpeechS} label="Usable speech" />
      <p className="text-[13px] text-muted">
        {minutes(session.usableSpeechS)} of {minutes(session.requiredSpeechS)} minutes of usable
        speech.{' '}
        {ready
          ? 'You can build your voice now. Keep going for a better result: 10 minutes or more is ideal.'
          : 'Keep reading; every good take counts.'}
      </p>
    </div>
  );
}

function ImportRecording({ session }: Readonly<{ session: VoiceSession }>) {
  const importer = useImportRecording();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const choose = (file: File) => {
    setProblem(null);
    if (!IMPORT_TYPES.test(file.name)) setProblem('Import a WAV, FLAC or OGG file.');
    else if (file.size > MAX_IMPORT_BYTES)
      setProblem('That file is larger than 600 MB. Split it into shorter parts.');
    else {
      const before = session.takes.length;
      importer.mutate(
        { sessionId: session.id, file },
        { onSuccess: (updated) => setAdded(updated.takes.length - before) },
      );
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <p className="text-[13px] text-muted">
        Recorded the passages in Audacity or another app? Import the file; it’s split into takes at
        the pauses.
      </p>
      <div>
        <Button
          size="sm"
          icon={<FileAudio size={14} />}
          loading={importer.isPending}
          onClick={() => input.current?.click()}
        >
          Import a recording
        </Button>
        <input
          ref={input}
          type="file"
          accept=".wav,.flac,.ogg,audio/wav,audio/flac,audio/ogg"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a recording to import"
          data-testid="session-import-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) choose(file);
            event.target.value = '';
          }}
        />
      </div>
      {importer.isSuccess ? (
        <Banner tone="success">Added {added} takes from your recording.</Banner>
      ) : null}
      {problem ? <Banner tone="error">{problem}</Banner> : null}
      {importer.isError ? <Banner tone="error">{describeError(importer.error)}</Banner> : null}
    </div>
  );
}

export function SessionRecorder({
  session,
  deviceId,
}: Readonly<{ session: VoiceSession; deviceId: string }>) {
  const takeFor = (id: string) => session.takes.find((take) => take.promptId === id);
  const firstOpen = PASSAGES.findIndex((passage) => !takeFor(passage.id)?.quality.ok);
  const [index, setIndex] = useState(Math.max(firstOpen, 0));
  const save = useSaveTake();
  const passage = PASSAGES[index]!; // index stays within the passages
  const take = takeFor(passage.id);
  const recorder = useTakeRecorder(MAX_TAKE_S, (clip) =>
    save.mutate(
      {
        sessionId: session.id,
        number: index + 1,
        promptId: passage.id,
        wav: encodeWav(clip.samples, clip.sampleRate, 24),
      },
      {
        onSuccess: (saved) =>
          saved.quality.ok && setIndex((current) => Math.min(current + 1, PASSAGES.length - 1)),
      },
    ),
  );
  const busy = recorder.recording || save.isPending;
  const recorded = PASSAGES.filter((item) => takeFor(item.id)?.quality.ok).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Passage {index + 1} of {PASSAGES.length}{' '}
          <span className="font-normal text-muted">· {passage.style}</span>
        </p>
        <div className="flex gap-1">
          <IconButton
            label="Previous passage"
            icon={<ChevronLeft size={16} />}
            size="sm"
            disabled={busy || index === 0}
            onClick={() => setIndex(index - 1)}
          />
          <IconButton
            label="Next passage"
            icon={<ChevronRight size={16} />}
            size="sm"
            disabled={busy || index === PASSAGES.length - 1}
            onClick={() => setIndex(index + 1)}
          />
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        <p className="font-serif text-lg leading-relaxed sm:text-xl">{passage.text}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {recorder.recording ? (
          <>
            <LevelMeter level={recorder.level} />
            <p className="text-xl font-semibold tabular-nums">{formatClock(recorder.elapsed)}</p>
            <Button
              variant="danger"
              size="lg"
              icon={<Square size={16} fill="currentColor" />}
              onClick={() => void recorder.stop()}
            >
              Stop
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<Mic size={18} />}
            loading={save.isPending}
            onClick={() => void recorder.start(deviceId || undefined)}
          >
            {take ? 'Record again' : 'Record'}
          </Button>
        )}
        {busy ? null : <TakeVerdict take={take} />}
      </div>
      {recorder.error ? <Banner tone="error">{recorder.error}</Banner> : null}
      {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
      <p className="text-[13px] text-muted">
        {recorded} of {PASSAGES.length} passages recorded
        {session.takes.some((item) => item.source === 'import') ? ', plus imported takes' : ''}.
      </p>
      <SpeechProgress session={session} />
      <ImportRecording session={session} />
    </div>
  );
}
