// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The voice library's credits: the full wording of each source of voices, shown once.
 * Scope: Groups the voices by their full attribution (Kokoro's built-in voices, the Chatterbox voice, cloned
 *   voices, blends), shows each text once under its one-line credit with the voices it covers, says where the
 *   licence texts are, and is where every card's "Credits" link leads (scrolled to and focused).
 * Does NOT belong: The wording itself (the server's engines/credits.py) or the cards (VoiceCard).
 */
import type { MouseEvent } from 'react';
import type { VoiceInfo } from '@/api/types';

export const CREDITS_ID = 'voice-credits';
// The Windows app's runtime folder, built without a backslash in the source.
const RUNTIME = ['%LOCALAPPDATA%', 'TTSNative', 'runtime'].join(String.fromCodePoint(92));

interface CreditGroup {
  credit: string;
  attribution: string;
  names: string[];
}

/** Every distinct attribution once, in the order the voices list them, with the voices it covers. */
export function creditGroups(voices: readonly VoiceInfo[]): CreditGroup[] {
  const groups = new Map<string, CreditGroup>();
  for (const voice of voices) {
    if (!voice.attribution) continue;
    const group = groups.get(voice.attribution) ?? {
      credit: voice.credit || voice.attribution,
      attribution: voice.attribution,
      names: [],
    };
    group.names.push(voice.name);
    groups.set(voice.attribution, group);
  }
  return [...groups.values()];
}

/** A card's "Credits" link: scroll to the credits and move focus there, without changing the page's address. */
export function showCredits(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const heading = document.getElementById(`${CREDITS_ID}-title`);
  heading?.scrollIntoView({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

function covers(names: readonly string[]): string {
  return names.length === 1 ? String(names[0]) : `${names.length} voices`;
}

export function VoiceCredits({ voices }: Readonly<{ voices: readonly VoiceInfo[] }>) {
  const groups = creditGroups(voices);
  if (groups.length === 0) return null;
  return (
    <section
      id={CREDITS_ID}
      aria-labelledby={`${CREDITS_ID}-title`}
      className="mt-10 border-t border-line pt-6"
    >
      <h2 id={`${CREDITS_ID}-title`} tabIndex={-1} className="text-lg font-semibold outline-none">
        Voice credits
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Every voice here is synthetic speech generated on this computer, not a recording of a
        person. Each card shows a one-line credit; the full wording for each source of voices is
        here.
      </p>
      <dl className="mt-4 flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.attribution}>
            <dt className="text-sm font-medium">
              {group.credit} <span className="font-normal text-muted">· {covers(group.names)}</span>
            </dt>
            <dd className="mt-1 text-[13px] leading-snug text-muted">{group.attribution}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13px] text-muted">
        Each engine&apos;s licence is also shown in Settings → Engines &amp; models. The Windows app
        keeps the licence texts and notices of everything it ships, the voice model&apos;s included,
        in <span className="break-all">THIRD-PARTY-NOTICES.txt</span> and the licenses folder of{' '}
        <span className="break-all">{RUNTIME}</span>.
      </p>
    </section>
  );
}
