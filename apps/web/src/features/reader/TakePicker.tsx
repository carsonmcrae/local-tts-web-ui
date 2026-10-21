// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Fix one badly read sentence by trying other takes and keeping the best.
 * Scope: For a single sentence: "Try another take" asks the server for the next take (a different
 *   seed of the same voice), each candidate can be played and kept, and "Back to the first take"
 *   restores the original. Keeping a take saves it and refreshes playback. Built-in voices, which
 *   always read a sentence the same way, get a plain explanation instead.
 * Does NOT belong: Generating takes (the server) or the rest of the styling dialog.
 */
import { Check, Play, RotateCcw, Shuffle, Square } from 'lucide-react';
import { useState } from 'react';
import { ApiError, describeError } from '@/api/client';
import { useMakeTake, useStyleSentences } from '@/api/stylingQueries';
import type { SentenceTake } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { useClipPlayer } from '@/features/studio/useClipPlayer';

export function TakePicker({
  documentId,
  index,
  voiceId,
  currentTake,
  onChanged,
}: Readonly<{
  documentId: string;
  index: number;
  voiceId: string;
  currentTake: number | null;
  onChanged: () => void;
}>) {
  const make = useMakeTake(documentId, index);
  const save = useStyleSentences(documentId);
  const player = useClipPlayer();
  const [takes, setTakes] = useState<SentenceTake[]>([]);
  const kept = currentTake ?? 0;
  const latest = takes.at(-1)?.take ?? kept;
  const notSupported = make.error instanceof ApiError && make.error.code === 'take_not_supported';

  const tryAnother = () =>
    make.mutate(
      { voiceId, take: latest + 1 },
      { onSuccess: (take) => setTakes((previous) => [...previous, take]) },
    );
  const keep = (take: number) =>
    save.mutate({ indexes: [index], take: take === 0 ? null : take }, { onSuccess: onChanged });

  return (
    <section aria-label="Takes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {kept ? `Playing take ${kept + 1}.` : 'Playing the first take.'} A new take reads the
          sentence again, slightly differently.
        </p>
        <Button
          size="sm"
          icon={<Shuffle size={14} />}
          loading={make.isPending}
          onClick={tryAnother}
        >
          Try another take
        </Button>
      </div>
      {takes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {takes.map((take) => {
            const playing = player.playing === take.audioUrl;
            return (
              <li key={take.take} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">Take {take.take + 1}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={playing ? <Square size={13} fill="currentColor" /> : <Play size={13} />}
                  onClick={() => player.toggle(take.audioUrl)}
                >
                  {playing ? 'Stop' : 'Listen'}
                </Button>
                <Button
                  size="sm"
                  icon={<Check size={14} />}
                  disabled={take.take === kept || save.isPending}
                  onClick={() => keep(take.take)}
                >
                  {take.take === kept ? 'Kept' : 'Keep this take'}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {kept ? (
        <div>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => keep(0)}>
            Back to the first take
          </Button>
        </div>
      ) : null}
      {make.isError ? (
        <Banner tone={notSupported ? 'info' : 'error'}>{describeError(make.error)}</Banner>
      ) : null}
      {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
    </section>
  );
}
