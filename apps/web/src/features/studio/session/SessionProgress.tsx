// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: How far a studio session has come, measured by what the voice will actually use.
 * Scope: The three voice tiers (Foundation: a working voice; Developing: its sound has settled;
 *   Complete: every speaking style has the takes it uses, so more passages wouldn't change it) with
 *   the current one marked, each style's takes out of three, the passage that would help most next
 *   (with a way to go to it), and what building early means. No model is trained, and it says so.
 * Does NOT belong: Recording, the passages or building (SessionRecorder, PassageParts, BuildStep).
 */
import { Check, Minus } from 'lucide-react';
import type { VoiceSession } from '@/api/types';
import { Banner, ProgressBar } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { FOUNDATION_ID, PASSAGES } from './passages';

const minutes = (seconds: number) => (seconds / 60).toFixed(1);
const TIERS = [
  { id: 'foundation', label: 'Foundation', detail: 'a working voice' },
  { id: 'developing', label: 'Developing', detail: 'its sound has settled' },
  { id: 'complete', label: 'Complete', detail: 'every style it uses' },
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
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <p className="text-muted">Speaking styles your takes can teach:</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Speaking styles">
        {session.styles.map(({ style, takes, needed }) => (
          <li
            key={style}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-0.5',
              takes >= needed ? 'text-fg border-success/50' : 'border-line text-muted',
            )}
          >
            {takes >= needed ? <Check size={12} aria-hidden /> : <Minus size={12} aria-hidden />}
            {STYLES[style]?.label ?? style} {Math.min(takes, needed)}/{needed}
            <span className="sr-only">
              {takes >= needed ? ', has all it uses' : ', needs more'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NextPassage({
  session,
  onJump,
}: Readonly<{ session: VoiceSession; onJump?: ((index: number) => void) | undefined }>) {
  const index = PASSAGES.findIndex((passage) => passage.id === session.suggested[0]);
  const passage = PASSAGES[index];
  if (!passage) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
      <span>
        Most useful next: <span className="text-fg">{passage.style}</span> (“
        {passage.text.split(' ').slice(0, 6).join(' ')}…”)
      </span>
      {onJump ? (
        <button
          type="button"
          className="min-h-11 rounded-[var(--radius-md)] px-2 font-medium text-accent-text underline-offset-2 hover:underline"
          onClick={() => onJump(index)}
        >
          Go to it
        </button>
      ) : null}
    </p>
  );
}

export function SpeechProgress({
  session,
  onJump,
}: Readonly<{ session: VoiceSession; onJump?: ((index: number) => void) | undefined }>) {
  const foundation = session.takes.some(
    (take) => take.promptId === FOUNDATION_ID && take.quality.ok,
  );
  const needed = session.styles.reduce((sum, style) => sum + style.needed, 0);
  const have = session.styles.reduce((sum, style) => sum + Math.min(style.takes, style.needed), 0);
  let advice = 'Keep reading the suggested passages; each one adds something the voice will use.';
  if (session.complete)
    advice =
      'Your voice has everything it uses: its sound and three takes of every speaking style. More passages won’t change it, so you can build now.';
  else if (!foundation)
    advice = 'Start with the foundation passage: with it you can build an early version.';
  else if (!session.canBuild)
    advice = `Record a little more (${session.minimumSpeechS.toFixed(0)} seconds in all) to build an early version.`;
  return (
    <div className="flex flex-col gap-3">
      <TierSteps tier={session.tier} />
      <ProgressBar value={needed ? have / needed : 0} label="What your voice uses" />
      <p className="text-[13px] text-muted">
        {minutes(session.usableSpeechS)} minutes of usable speech.{' '}
        {session.canBuild && !session.complete ? null : advice}
      </p>
      <StyleCoverage session={session} />
      {session.complete ? null : <NextPassage session={session} onJump={onJump} />}
      {session.canBuild && !session.complete ? <EarlyVoiceNote /> : null}
    </div>
  );
}

/** What building before the session is complete means for the voice. */
export function EarlyVoiceNote({ building = false }: Readonly<{ building?: boolean }>) {
  if (building)
    return (
      <Banner tone="warning" title="This will be an early version of your voice">
        Some speaking styles don’t have their three takes yet, so questions or lively lines may
        sound less like you. Go back, record the suggested passages and build again at any time.
      </Banner>
    );
  return (
    <Banner tone="warning" title="You can build an early version now">
      It won’t be complete: some speaking styles have fewer than three takes, so questions or lively
      lines may sound less like you. Continue now, or record the suggested passages (about 15 in
      all) for a complete voice. You can come back to this session and add passages later.
    </Banner>
  );
}
