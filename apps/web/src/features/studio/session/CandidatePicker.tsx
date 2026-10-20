// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Listen to the best built voices and choose one.
 * Scope: The top three candidates as radio choices, best match first, each with its match score, the
 *   passage it was built from and playable test samples (one clip plays at a time).
 * Does NOT belong: Building (BuildStep) or saving the voice.
 */
import { Play, Square } from 'lucide-react';
import type { VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { useClipPlayer } from '../useClipPlayer';
import { PASSAGES } from './passages';

const SHOWN = 3;

function source(promptId: string | null, takeNumber: number): string {
  const passage = PASSAGES.find((item) => item.id === promptId);
  if (!passage) return `Built from imported take ${takeNumber}`;
  // Every passage is longer than this, so the excerpt always ends with an ellipsis.
  return `Built from “${passage.text.split(' ').slice(0, 9).join(' ')}…”`;
}

export function CandidatePicker({
  session,
  value,
  onChange,
}: Readonly<{ session: VoiceSession; value: number | null; onChange: (index: number) => void }>) {
  const player = useClipPlayer();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm leading-relaxed text-muted">
        Listen to each voice and choose the one that sounds most like the speaker. The match score
        compares each voice with the whole session.
      </legend>
      {session.candidates.slice(0, SHOWN).map((candidate, rank) => {
        const id = `candidate-${candidate.index}`;
        const chosen = value === candidate.index;
        return (
          <div
            key={candidate.index}
            className={cn(
              'rounded-[var(--radius-lg)] border p-4',
              chosen ? 'border-accent bg-accent-soft/40' : 'border-line',
            )}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                id={id}
                name="candidate"
                checked={chosen}
                onChange={() => onChange(candidate.index)}
                className="mt-1 size-4 accent-[var(--color-accent)]"
              />
              <label htmlFor={id} className="flex-1 cursor-pointer">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Voice {rank + 1}</span>
                  {rank === 0 ? <Badge tone="accent">Best match</Badge> : null}
                  <span className="text-sm text-muted">
                    {Math.round(candidate.similarity * 100)}% match
                  </span>
                </span>
                <span className="mt-1 block text-[13px] text-muted">
                  {source(candidate.promptId, candidate.takeNumber)}
                </span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-7">
              {Array.from({ length: candidate.samples }, (_, sample) => {
                const src = `/api/voice-sessions/${session.id}/candidates/${candidate.index}/samples/${sample}`;
                const playing = player.playing === src;
                return (
                  <Button
                    key={src}
                    size="sm"
                    icon={
                      playing ? (
                        <Square size={13} fill="currentColor" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )
                    }
                    aria-label={`${playing ? 'Stop' : 'Play'} sample ${sample + 1} of voice ${rank + 1}`}
                    onClick={() => player.toggle(src)}
                  >
                    Sample {sample + 1}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
