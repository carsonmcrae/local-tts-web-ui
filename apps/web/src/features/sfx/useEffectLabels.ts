// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Describe, for the reading text, the sentences that carry a placed sound effect.
 * Scope: Reads the document's arrangement and the library (only once there is something to name)
 *   and maps each sentence index with an accepted effect to "Sound effect: <name>", joining several
 *   on one sentence with commas. A sound the library lacks is named by its id.
 * Does NOT belong: Rendering the marker (DocumentText) or playing anything (session.ts).
 */
import { useMemo } from 'react';
import { useSoundEffects, useSoundLibrary } from './queries';

export function useEffectLabels(documentId: string): ReadonlyMap<number, string> {
  const effects = useSoundEffects(documentId);
  const library = useSoundLibrary(Boolean(effects.data?.effects?.length));
  return useMemo(() => {
    const names = new Map((library.data?.sounds ?? []).map((sound) => [sound.id, sound.name]));
    const labels = new Map<number, string>();
    // A well-formed answer lists effects; anything else marks nothing.
    for (const effect of effects.data?.effects ?? []) {
      if (effect.status !== 'accepted') continue;
      const name = names.get(effect.soundId) ?? effect.soundId;
      const before = labels.get(effect.segmentIndex);
      labels.set(effect.segmentIndex, before ? `${before}, ${name}` : `Sound effect: ${name}`);
    }
    return labels;
  }, [effects.data, library.data]);
}
