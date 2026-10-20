// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Expose one app-wide PlaybackController to React and keep it in sync with preferences.
 * Scope: Creates the controller with real fetch/audio dependencies (or injected ones for tests),
 *   subscribes via useSyncExternalStore, applies saved voice/rate/pace once, debounces progress
 *   saves, and wires the Media Session API (lock-screen and hardware media keys).
 * Does NOT belong: Player UI (PlayerBar) or keyboard shortcuts (useShortcuts).
 */
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ApiError, api, describeError, prepareAudio } from '@/api/client';
import { keys, usePreferences } from '@/api/queries';
import type { MediaLike, PlayerState } from './controller';
import { PlaybackController } from './controller';

interface PlayerContextValue {
  controller: PlaybackController;
  state: PlayerState;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);
const SAVE_DEBOUNCE_MS = 800;

function createController(
  media: MediaLike,
  onSaved: (documentId: string) => void,
): PlaybackController {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return new PlaybackController(
    {
      media,
      fetchSegment: (documentId, index, voiceId, pace, prefetch, signal) =>
        prepareAudio(`/api/documents/${documentId}/segments/${index}/audio`, {
          query: { voice: voiceId, pace, prefetch: prefetch || undefined },
          signal,
        }),
      saveProgress: (documentId, index, voiceId) => {
        globalThis.clearTimeout(timers.get(documentId));
        timers.set(
          documentId,
          globalThis.setTimeout(() => {
            api(`/api/documents/${documentId}/progress`, {
              method: 'PUT',
              json: { segmentIndex: index, voiceId },
            })
              .then(() => onSaved(documentId))
              .catch(() => undefined);
          }, SAVE_DEBOUNCE_MS),
        );
      },
      toError: (error) =>
        error instanceof ApiError
          ? { code: error.code, message: error.message }
          : { code: 'playback_error', message: describeError(error) },
    },
    { voiceId: 'kokoro:af_heart', rate: 1, pace: 1 },
  );
}

function useMediaSession(controller: PlaybackController, state: PlayerState): void {
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.document) return;
    const section = controller.sectionAt(state.segmentIndex);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.document.title,
      artist: section?.title ?? 'Local TTS',
      album: 'Local TTS',
    });
    navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : 'paused';
  }, [controller, state.document, state.segmentIndex, state.status]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => void controller.play()],
      ['pause', () => controller.pause()],
      ['previoustrack', () => void controller.previous()],
      ['nexttrack', () => void controller.next()],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action on this browser.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [controller]);
}

export function PlayerProvider({
  children,
  media,
}: Readonly<{ children: ReactNode; media?: MediaLike }>) {
  const queryClient = useQueryClient();
  const [controller] = useState(() =>
    createController(media ?? new Audio(), (documentId) => {
      // Refresh only the library list and this document's summary — never cached section text.
      void queryClient.invalidateQueries({ queryKey: keys.documents, exact: true });
      void queryClient.invalidateQueries({ queryKey: keys.document(documentId), exact: true });
    }),
  );
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
  );
  const preferences = usePreferences();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !preferences.data) return;
    applied.current = true;
    controller.setRate(preferences.data.playbackRate);
    void controller.setVoice(preferences.data.defaultVoiceId);
    void controller.setPace(preferences.data.pace);
  }, [controller, preferences.data]);

  useEffect(() => () => controller.unload(), [controller]);
  useMediaSession(controller, state);

  const value = useMemo(() => ({ controller, state }), [controller, state]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return value;
}
