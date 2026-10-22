// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Expose one background-music session to React, following the app's narration player.
 * Scope: Creates the session with the real engine (a Web Audio context made on first use, tracks
 *   fetched from this app's own server) and the choice saved on this device, attaches it to the
 *   player while mounted, and subscribes components via useSyncExternalStore.
 * Does NOT belong: When music plays (session.ts), Web Audio (engine.ts) or the controls (MusicMenu).
 */
import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ContextLike } from '@/lib/audio/webAudio';
import { MusicEngine } from './engine';
import { TRACKS, trackUrl } from './library';
import { readMusicChoice, saveMusicChoice } from './preferences';
import type { PlayerSource } from '@/features/player/follow';
import type { MusicState } from './session';
import { MusicSession } from './session';

interface MusicContextValue {
  music: MusicSession;
  state: MusicState;
}

const MusicContext = createContext<MusicContextValue | null>(null);

/** Throws where the browser has no Web Audio; the engine reports that as "unavailable". */
function createAudioContext(): ContextLike {
  // 'playback' trades a little latency (irrelevant for a music bed) for fewer wake-ups.
  return new AudioContext({ latencyHint: 'playback' });
}

async function fetchTrack(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The track couldn't be loaded (${response.status}).`);
  return response.arrayBuffer();
}

export function MusicProvider({
  player,
  children,
}: Readonly<{ player: PlayerSource; children: ReactNode }>) {
  const [music] = useState(
    () =>
      new MusicSession({
        player,
        tracks: TRACKS,
        url: trackUrl,
        createEngine: (events) =>
          new MusicEngine({ ...events, createContext: createAudioContext, fetchTrack }),
        choice: {
          read: () => readMusicChoice(TRACKS.map((track) => track.id)),
          save: saveMusicChoice,
        },
      }),
  );
  const state = useSyncExternalStore(
    (listener) => music.subscribe(listener),
    () => music.getState(),
  );
  useEffect(() => music.attach(), [music]);
  const value = useMemo(() => ({ music, state }), [music, state]);
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const value = useContext(MusicContext);
  if (!value) throw new Error('useMusic must be used inside <MusicProvider>');
  return value;
}
