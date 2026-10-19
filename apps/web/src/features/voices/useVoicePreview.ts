/**
 * Purpose: Play short voice previews, one at a time, reusing audio already generated.
 * Scope: A single preview audio element, a per-(voice, text, pace) cache of direct audio URLs, loading/playing
 *   state per voice, cancellation of superseded requests and cleanup on unmount.
 * Does NOT belong: Document narration (PlaybackController).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, describeError, prepareAudio } from '@/api/client';

export interface PreviewState {
  voiceId: string | null;
  status: 'idle' | 'loading' | 'playing';
  error: { voiceId: string; message: string; code: string } | null;
}

export function useVoicePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<PreviewState>({ voiceId: null, status: 'idle', error: null });

  useEffect(() => {
    const element = new Audio();
    element.addEventListener('ended', () =>
      setState((s) => ({ ...s, status: 'idle', voiceId: null })),
    );
    audio.current = element;
    const urls = cache.current;
    return () => {
      element.pause();
      pending.current?.abort();
      urls.clear();
    };
  }, []);

  const stop = useCallback(() => {
    pending.current?.abort();
    audio.current?.pause();
    setState((s) => ({ ...s, status: 'idle', voiceId: null }));
  }, []);

  const play = useCallback(async (voiceId: string, text: string | undefined, pace = 1) => {
    const element = audio.current;
    if (!element) return;
    pending.current?.abort();
    element.pause();
    const key = `${voiceId}|${pace}|${text ?? ''}`;
    setState({ voiceId, status: 'loading', error: null });
    try {
      let url = cache.current.get(key);
      if (!url) {
        const controller = new AbortController();
        pending.current = controller;
        const result = await prepareAudio(`/api/voices/${voiceId}/preview`, {
          method: 'POST',
          json: { text: text?.trim() ? text : null, pace },
          signal: controller.signal,
        });
        url = result.url;
        cache.current.set(key, url);
      }
      element.src = url;
      await element.play();
      setState({ voiceId, status: 'playing', error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({
        voiceId: null,
        status: 'idle',
        error: {
          voiceId,
          message: describeError(error),
          code: error instanceof ApiError ? error.code : 'preview_failed',
        },
      });
    }
  }, []);

  return { state, play, stop };
}
