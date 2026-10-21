// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The fields for one pronunciation: the word as written and how to say it, with both heard
 *   side by side.
 * Scope: "Word or name" and "Say it as" (written the way it sounds, with plain examples; hyphens and
 *   capitals for the stressed syllable), "Hear as written" and "Hear respelling" in the reading voice,
 *   what is playing announced politely, and preview errors. Shared by Settings and the reader's dialog.
 * Does NOT belong: Saving, scopes or the list of rules (PronunciationSection, FixPronunciationDialog).
 */
import { Square, Volume2 } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner, StatusRegion } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { MAX_SAY_AS_CHARS, MAX_WORD_CHARS } from './pronunciationRules';
import type { Heard, PronunciationPreview } from './usePronunciationPreview';

export const RESPELLING_HINT =
  'Write it as it sounds: gnocchi → NYOH-kee, quinoa → KEEN-wah, Nguyen → Win. Join syllables with ' +
  'hyphens and put the stressed one in capitals. No special symbols needed.';

const PLAYING: Record<Heard, string> = {
  written: 'Playing the word as written.',
  respelling: 'Playing the respelling.',
};

function HearButton({
  kind,
  text,
  preview,
  children,
}: Readonly<{ kind: Heard; text: string; preview: PronunciationPreview; children: ReactNode }>) {
  const playing = preview.playing === kind;
  return (
    <Button
      size="sm"
      icon={playing ? <Square size={13} fill="currentColor" /> : <Volume2 size={15} />}
      loading={preview.loading === kind}
      disabled={text.trim() === '' || (preview.loading !== null && preview.loading !== kind)}
      aria-pressed={playing}
      onClick={() => void preview.hear(kind, text)}
    >
      {children}
    </Button>
  );
}

export function RespellingFields({
  word,
  sayAs,
  onWord,
  onSayAs,
  preview,
  wordHint = 'As it is written in your documents.',
  sayAsRef,
}: Readonly<{
  word: string;
  sayAs: string;
  onWord: (word: string) => void;
  onSayAs: (sayAs: string) => void;
  preview: PronunciationPreview;
  wordHint?: string;
  /** The respelling field, for moving focus to it. */
  sayAsRef?: Ref<HTMLInputElement>;
}>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Word or name" hint={wordHint}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={MAX_WORD_CHARS}
              value={word}
              onChange={(event) => onWord(event.target.value)}
            />
          )}
        </Field>
        <Field label="Say it as" hint={RESPELLING_HINT}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              ref={sayAsRef}
              aria-describedby={describedBy}
              maxLength={MAX_SAY_AS_CHARS}
              placeholder="NYOH-kee"
              autoComplete="off"
              spellCheck={false}
              value={sayAs}
              onChange={(event) => onSayAs(event.target.value)}
            />
          )}
        </Field>
      </div>
      <div role="group" aria-label="Compare in the reading voice" className="flex flex-wrap gap-2">
        <HearButton kind="written" text={word} preview={preview}>
          Hear as written
        </HearButton>
        <HearButton kind="respelling" text={sayAs} preview={preview}>
          Hear respelling
        </HearButton>
      </div>
      <StatusRegion className="sr-only">
        {preview.playing ? PLAYING[preview.playing] : ''}
      </StatusRegion>
      {preview.error ? <Banner tone="error">{preview.error}</Banner> : null}
    </div>
  );
}
