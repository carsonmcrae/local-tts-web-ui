// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: How far a studio session has come, without nagging.
 * Scope: The three voice tiers (Foundation: an early voice; Developing: half way; Complete: the full
 *   voice) with the current one marked, the usable speech so far, which speaking styles the takes
 *   can teach (narration, questions, lively lines, dialogue, calm) with one gentle pointer to the
 *   passages that would add a missing one, and what building early means for the voice.
 * Does NOT belong: Recording, the passages or building (SessionRecorder, PassageParts, BuildStep).
 */
import { Check, Minus } from 'lucide-react';
import type { VoiceSession } from '@/api/types';
import { Banner, ProgressBar } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { FOUNDATION_ID } from './passages';

const minutes = (seconds: number) => (seconds / 60).toFixed(1);
const TIERS = [
  { id: 'foundation', label: 'Foundation', detail: 'an early voice' },
  { id: 'developing', label: 'Developing', detail: 'half way there' },
  { id: 'complete', label: 'Complete', detail: 'the full voice' },
] as const;
const STYLES: Readonly<Record<string, { label: string; passages: string }>> = {
  narration: { label: 'Narration', passages: 'the foundation and narration passages' },
  question: { label: 'Questions', passages: 'the questions and surprise passages' },
  lively: {
    label: 'Lively lines',
    passages: 'the questions and surprise and storytelling passages',
  },
  dialogue: { label: 'Dialogue', passages: 'the storytelling and conversation passages' },
  calm: { label: 'Calm lines', passages: 'the calm and reflective passages' },
};

function TierSteps({ tier }: Readonly<{ tier: VoiceSession['tier'] }>) {
  const reached = TIERS.findIndex((step) => step.id === tier);
  return (
    <ol aria-label="Your voice so far" className="grid grid-cols-3 gap-2 text-[13px]">
      {TIERS.map((step, position) => (
        <li
          key={step.id}
          aria-current={position === reached ? 'step' : undefined}
          className={cn(
            'flex flex-col rounded-[var(--radius-md)] border px-3 py-2',
            position <= reached ? 'border-success/50 bg-success/10' : 'border-line text-muted',
            position === reached && 'ring-2 ring-accent',
          )}
        >
          <span className="flex items-center gap-1.5 font-medium">
            {position <= reached ? <Check size={13} aria-hidden /> : null}
            {step.label}
            <span className="sr-only">{position <= reached ? ', reached' : ', not yet'}</span>
          </span>
          <span className="text-muted">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function StyleCoverage({ session }: Readonly<{ session: VoiceSession }>) {
  if (!session.takes.some((take) => take.quality.ok)) return null; // nothing to say before the first take
  const missing = session.styles.find((style) => style.takes === 0);
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <p className="text-muted">Speaking styles your takes can teach:</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Speaking styles">
        {session.styles.map(({ style, takes }) => (
          <li
            key={style}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-0.5',
              takes > 0 ? 'text-fg border-success/50' : 'border-line text-muted',
            )}
          >
            {takes > 0 ? <Check size={12} aria-hidden /> : <Minus size={12} aria-hidden />}
            {STYLES[style]?.label ?? style}
            <span className="sr-only">{takes > 0 ? ', covered' : ', not yet'}</span>
          </li>
        ))}
      </ul>
      {missing && STYLES[missing.style] ? (
        <p className="text-muted">
          Optional: {STYLES[missing.style]?.passages} would teach{' '}
          {STYLES[missing.style]?.label.toLowerCase()}.
        </p>
      ) : null}
    </div>
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
    <div className="flex flex-col gap-3">
      <TierSteps tier={session.tier} />
      <ProgressBar value={session.usableSpeechS / session.requiredSpeechS} label="Usable speech" />
      <p className="text-[13px] text-muted">
        {minutes(session.usableSpeechS)} of {minutes(session.requiredSpeechS)} minutes of usable
        speech. {session.canBuild && !session.complete ? null : advice}
      </p>
      <StyleCoverage session={session} />
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
