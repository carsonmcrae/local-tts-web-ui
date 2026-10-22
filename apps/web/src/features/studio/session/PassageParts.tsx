// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The pieces of the studio recorder around one passage.
 * Scope: The passage with its reading suggestion (the inflection and pauses it can teach; a
 *   suggestion only, never something to exaggerate) and a collapsible strip to jump to any passage
 *   (showing which are recorded, have advice or need another take).
 * Does NOT belong: Recording, saving or navigation state (SessionRecorder), reviewing a take
 *   (TakeReview) or the session's progress (SessionProgress).
 */
import { Lightbulb } from 'lucide-react';
import type { SessionTake, VoiceSession } from '@/api/types';
import { cn } from '@/lib/cn';
import { FOUNDATION_ID, type Passage, PASSAGES } from './passages';

export function PassageCard({ passage }: Readonly<{ passage: Passage }>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        <p className="font-serif text-lg leading-relaxed sm:text-xl">{passage.text}</p>
      </div>
      <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
        <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="text-fg font-medium">How to read it (a suggestion): </span>
          {passage.hint}
          {passage.id === FOUNDATION_ID ? (
            <span className="mt-1 block">
              Read in your own natural voice; there’s no need to exaggerate. Your normal way of
              speaking is what the voice should learn.
            </span>
          ) : null}
        </span>
      </p>
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
          const foundation = passage.id === FOUNDATION_ID;
          const label = foundation ? 'F' : String(position);
          const name = foundation ? 'Foundation passage' : `Passage ${position}`;
          return (
            <li key={passage.id}>
              <button
                type="button"
                disabled={disabled}
                aria-current={position === index ? 'step' : undefined}
                aria-label={`${name}, ${STATUS_LABEL[status]}`}
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
