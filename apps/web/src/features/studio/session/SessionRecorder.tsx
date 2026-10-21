// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Record a studio session one passage at a time, each take checked and saved at once.
 * Scope: Passage navigation (starting at the first passage without a good take, with a strip to
 *   jump to any passage), the passage with its reading hint, record and stop with a live level
 *   meter, lossless 24-bit upload at the input's own rate together with the passage text (so the
 *   server can tell how much was read), the take's verdict with a button to listen back, moving on
 *   after a good take, progress towards an early or a complete voice, and importing a long
 *   WAV/FLAC/OGG recording made in another app.
 * Does NOT belong: The microphone check or building the voice.
 */
import { ChevronLeft, ChevronRight, Mic, Square } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useSaveTake } from '@/api/queries';
import type { VoiceSession } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { formatClock } from '@/lib/format';
import { encodeWav } from '@/lib/audio/wav';
import { LevelMeter } from '../LevelMeter';
import { ImportRecording } from './ImportRecording';
import { PassageCard, PassageStrip, SpeechProgress, TakeReview } from './PassageParts';
import { FOUNDATION_ID, maxTakeSeconds, PASSAGES } from './passages';
import { useTakeRecorder } from './useTakeRecorder';

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
  const recorder = useTakeRecorder(maxTakeSeconds(passage), (clip) =>
    save.mutate(
      {
        sessionId: session.id,
        number: passage.number,
        promptId: passage.id,
        text: passage.text,
        wav: encodeWav(clip.samples, clip.sampleRate, 24),
      },
      {
        onSuccess: (saved) =>
          saved.quality.ok && setIndex((current) => Math.min(current + 1, PASSAGES.length - 1)),
      },
    ),
  );
  const busy = recorder.recording || save.isPending;
  const foundation = passage.id === FOUNDATION_ID;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {foundation ? 'Foundation passage' : `Passage ${index} of ${PASSAGES.length - 1}`}{' '}
          <span className="font-normal text-muted">
            · {foundation ? 'about a minute, record it first' : passage.style}
          </span>
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
      <PassageCard passage={passage} />
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
        {busy ? null : <TakeReview session={session} take={take} />}
      </div>
      {recorder.error ? <Banner tone="error">{recorder.error}</Banner> : null}
      {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
      <PassageStrip session={session} index={index} disabled={busy} onJump={setIndex} />
      {session.takes.some((item) => item.source === 'import') ? (
        <p className="text-[13px] text-muted">Imported takes count towards your speech too.</p>
      ) : null}
      <SpeechProgress session={session} />
      <ImportRecording session={session} />
    </div>
  );
}
