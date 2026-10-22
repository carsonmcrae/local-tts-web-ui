// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Hear a word as written and as respelled, in the reading voice and pace, before saving it.
 * Scope: Asks the server for each clip once per voice, pace and text (listening again replays it),
 *   plays one clip at a time, and says which one is loading or playing and what went wrong.
 * Does NOT belong: Voice previews (useVoicePreview) or saving pronunciations.
 */
import { useRef, useState } from 'react';
import { api, describeError } from '@/api/client';
import type { components } from '@/api/schema.gen';
import { useClipPlayer } from '@/features/studio/useClipPlayer';

type PreviewClip = components['schemas']['PronunciationPreviewOut'];
export type Heard = 'written' | 'respelling';

export function usePronunciationPreview(voiceId: string, pace = 1) {
  const player = useClipPlayer();
  const clips = useRef(new Map<string, string>());
  const [loading, setLoading] = useState<Heard | null>(null);
  const [heard, setHeard] = useState<{ kind: Heard; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clip = async (kind: Heard, text: string): Promise<string | null> => {
    const key = `${voiceId}\n${pace}\n${kind}\n${text.trim()}`;
    const known = clips.current.get(key);
    if (known) return known;
    setLoading(kind);
    try {
      const made = await api<PreviewClip>('/api/pronunciation-preview', {
        method: 'POST',
        json: { voiceId, text, respelling: kind === 'respelling', pace },
      });
      clips.current.set(key, made.audioUrl);
      return made.audioUrl;
    } catch (failure) {
      setError(describeError(failure));
      return null;
    } finally {
      setLoading(null);
    }
  };

  /** Plays the word as written, or the respelling; pressing it again while it plays stops it. */
  const hear = async (kind: Heard, text: string) => {
    setError(null);
    const url = await clip(kind, text);
    if (!url) return;
    setHeard({ kind, url });
    player.toggle(url);
  };

  const playing = player.playing !== null && player.playing === heard?.url ? heard.kind : null;
  return { hear, loading, playing, error };
}

export type PronunciationPreview = ReturnType<typeof usePronunciationPreview>;
