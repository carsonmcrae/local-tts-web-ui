// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The pieces of the studio recorder around one passage.
 * Scope: The passage with its reading hint (the inflection and pauses it teaches), a take's verdict
 *   with a button to listen back before deciding to record it again, a collapsible strip to jump to
 *   any passage (showing which are recorded, have advice or need another take), and the progress
 *   towards an early or a complete voice.
 * Does NOT belong: Recording, saving or navigation state (SessionRecorder).
 */
import { Lightbulb, Play, Square } from 'lucide-react';
import type { SessionTake, VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, ProgressBar } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { IssueList } from '../IssueList';
import { useClipPlayer } from '../useClipPlayer';
import { FOUNDATION_ID, type Passage, PASSAGES } from './passages';

const minutes = (seconds: number) => (seconds / 60).toFixed(1);

export function PassageCard({ passage }: Readonly<{ passage: Passage }>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        <p className="font-serif text-lg leading-relaxed sm:text-xl">{passage.text}</p>
      </div>
      <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
        <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="text-fg font-medium">How to read it: </span>
          {passage.hint}
        </span>
      </p>
    </div>
  );
}

/** A take's verdict, and a button to hear it back. */
export function TakeReview({
  session,
  take,
}: Readonly<{ session: VoiceSession; take: SessionTake | undefined }>) {
  const player = useClipPlayer();
  if (!take) return null;
  // The take's time is in the address so a new take of the same passage is never served from cache.
  const src = `/api/voice-sessions/${session.id}/takes/${take.number}/audio?v=${encodeURIComponent(take.createdAt)}`;
  const playing = player.playing === src;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {take.quality.ok ? (
          <Badge tone="success">Recorded · {take.durationS.toFixed(0)} s</Badge>
        ) : null}
        <Button
          size="sm"
          icon={playing ? <Square size={13} fill="currentColor" /> : <Play size={13} />}
          onClick={() => player.toggle(src)}
        >
          {playing ? 'Stop' : 'Listen to this take'}
        </Button>
      </div>
      {take.quality.issues.length > 0 ? (
        <div className="w-full">
          <IssueList issues={take.quality.issues} />
        </div>
      ) : null}
    </div>
  );
}

type Status = 'none' | 'ok' | 'advice' | 'retake';

function statusOf(take: SessionTake | undefined): Status {
  if (!take) return 'none';
  if (!take.quality.ok) return 'retake';
  return take.quality.issues.length > 0 ? 'advice' : 'ok';
}

const STATUS_LABEL: Record<Status, string> = {
  none: 'not recorded',
  ok: 'recorded',
  advice: 'recorded, with advice',
  retake: 'needs another take',
};
const STATUS_CLASS: Record<Status, string> = {
  none: 'border-line text-muted',
  ok: 'border-success/50 bg-success/15 text-fg',
  advice: 'border-warning/60 bg-warning/15 text-fg',
  retake: 'border-danger/60 bg-danger/15 text-fg',
};

/** Every passage as a small numbered button; F is the foundation passage. */
export function PassageStrip({
  session,
  index,
  disabled,
  onJump,
}: Readonly<{
  session: VoiceSession;
  index: number;
  disabled: boolean;
  onJump: (index: number) => void;
}>) {
  const recorded = PASSAGES.filter((passage) =>
    session.takes.some((take) => take.promptId === passage.id && take.quality.ok),
  ).length;
  return (
    <details className="group text-[13px]">
      <summary className="hover:text-fg cursor-pointer text-muted select-none">
        All passages ({recorded} of {PASSAGES.length} recorded)
      </summary>
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Passages">
        {PASSAGES.map((passage, position) => {
          const status = statusOf(session.takes.find((take) => take.promptId === passage.id));
          const label = passage.id === FOUNDATION_ID ? 'F' : String(position);
          return (
            <li key={passage.id}>
              <button
                type="button"
                disabled={disabled}
                aria-current={position === index ? 'step' : undefined}
                aria-label={`${passage.id === FOUNDATION_ID ? 'Foundation passage' : `Passage ${position}`}, ${STATUS_LABEL[status]}`}
                className={cn(
                  'h-7 w-7 rounded-[var(--radius-sm)] border text-xs tabular-nums disabled:opacity-50',
                  STATUS_CLASS[status],
                  position === index && 'ring-2 ring-accent',
                )}
                onClick={() => onJump(position)}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function SpeechProgress({ session }: Readonly<{ session: VoiceSession }>) {
  const foundation = session.takes.some(
    (take) => take.promptId === FOUNDATION_ID && take.quality.ok,
  );
  let advice = 'Keep reading; every good take counts.';
  if (session.complete)
    advice =
      'You can build your voice now. Keep going for a better result: 10 minutes or more is ideal.';
  else if (!foundation)
    advice += ' Short on time? Record the foundation passage and you can build an early version.';
  else if (!session.canBuild)
    advice += ` Record a little more (${session.minimumSpeechS.toFixed(0)} seconds in all) to build an early version.`;
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={session.usableSpeechS / session.requiredSpeechS} label="Usable speech" />
      <p className="text-[13px] text-muted">
        {minutes(session.usableSpeechS)} of {minutes(session.requiredSpeechS)} minutes of usable
        speech. {session.canBuild && !session.complete ? null : advice}
      </p>
      {session.canBuild && !session.complete ? <EarlyVoiceNote /> : null}
    </div>
  );
}

/** What building before the session is complete means for the voice. */
export function EarlyVoiceNote({ building = false }: Readonly<{ building?: boolean }>) {
  if (building)
    return (
      <Banner tone="warning" title="This will be an early version of your voice">
        Your session isn’t complete, so questions, lively lines and some words will sound less like
        you. Go back, record more passages and build again at any time.
      </Banner>
    );
  return (
    <Banner tone="warning" title="You can build an early version now">
      It won’t be complete: with less to learn from, questions, lively lines and some words will
      sound less like you. Continue now, or keep recording (5 minutes in all) for a complete voice.
      You can come back to this session and add passages later.
    </Banner>
  );
}
