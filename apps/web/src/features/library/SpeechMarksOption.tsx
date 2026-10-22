// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The "Use speech marks" choice when pasting text, with a short guide to the marks.
 * Scope: A checkbox (off by default) and, once it's on, the marks it understands: pauses, voices,
 *   effects, speaking styles, sounds and pronunciations, plus how to write a literal brace. The marks
 *   become sentence settings at import and never appear in the text.
 * Does NOT belong: Reading the marks (the server's speech_marks.py) or the paste dialog itself.
 */
import { Checkbox } from '@/components/ui/Field';

const MARKS: readonly (readonly [string, string])[] = [
  ['{pause 2s}', 'a pause (up to 10 s; {pause} alone is 1 s)'],
  ['{voice Sam} … {/voice}', 'another voice reads the sentences between'],
  ['{effect radio} … {/effect}', 'an effect such as radio, telephone, hall or quiet'],
  ['{style calm} … {/style}', 'a speaking style for studio voices'],
  ['{sound laugh}', 'a sound before the sentence'],
  ['{say Kael = Kay-el}', 'how a word is said in this document'],
];

export function SpeechMarksOption({
  checked,
  onCheckedChange,
}: Readonly<{ checked: boolean; onCheckedChange: (checked: boolean) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={
          <>
            Use speech marks{' '}
            <span className="text-muted">— instructions in braces, such as {'{pause 2s}'}</span>
          </>
        }
      />
      {checked ? (
        <div className="ml-8 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[13px]">
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
            {MARKS.map(([mark, meaning]) => (
              <div key={mark} className="contents">
                <dt>
                  <code className="text-fg font-mono">{mark}</code>
                </dt>
                <dd className="text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-muted">
            Write <code className="text-fg font-mono">{'{{'}</code> for a brace. Marks the app
            doesn’t know stay in the text, and the document lists them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
