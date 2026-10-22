// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Expose one sound-effects session to React, following the app's narration player.
 * Scope: Creates the session with the real engine (a Web Audio context made on first use, sounds
 *   fetched from this app's own server under /sfx/) and the choice saved on this device, attaches it
 *   to the player while mounted, hands it the bundled library and the loaded document's arrangement
 *   as their queries answer, and subscribes components via useSyncExternalStore.
 * Does NOT belong: When effects play (session.ts), Web Audio (engine.ts) or the controls (SoundPanel).
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
import type { SfxSound } from '@/api/types';
import { usePlayer } from '@/features/player/PlayerProvider';
import type { ContextLike } from './engine';
import { SfxEngine } from './engine';
import { readSfxChoice, saveSfxChoice } from './preferences';
import { useSoundEffects, useSoundLibrary } from './queries';
import type { SfxState } from './session';
import { SfxSession } from './session';

interface SfxContextValue {
  sfx: SfxSession;
  state: SfxState;
}

const SfxContext = createContext<SfxContextValue | null>(null);

/** Throws where the browser has no Web Audio; the engine reports that as "unavailable". */
function createAudioContext(): ContextLike {
  return new AudioContext({ latencyHint: 'interactive' });
}

async function fetchSound(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The sound couldn't be loaded (${response.status}).`);
  return response.arrayBuffer();
}

/** Where a bundled sound is served: beside the web app, so it needs no internet. */
function soundUrl(sound: Pick<SfxSound, 'file'>): string {
  return `${import.meta.env.BASE_URL}sfx/${sound.file}`;
}

export function SfxProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { controller } = usePlayer();
  const [sfx] = useState(
    () =>
      new SfxSession({
        player: controller,
        url: soundUrl,
        createEngine: (events) =>
          new SfxEngine({ ...events, createContext: createAudioContext, fetchSound }),
        choice: { read: readSfxChoice, save: saveSfxChoice },
      }),
  );
  const state = useSyncExternalStore(
    (listener) => sfx.subscribe(listener),
    () => sfx.getState(),
  );
  useEffect(() => sfx.attach(), [sfx]);
  const library = useSoundLibrary(Boolean(state.documentId));
  useEffect(() => {
    if (library.data) sfx.setLibrary(library.data.sounds);
  }, [sfx, library.data]);
  const effects = useSoundEffects(state.documentId);
  useEffect(() => {
    // A well-formed answer only: anything else leaves the session with no effects for this document.
    if (state.documentId && Array.isArray(effects.data?.effects))
      sfx.setEffects(state.documentId, effects.data.effects);
  }, [sfx, state.documentId, effects.data]);
  const value = useMemo(() => ({ sfx, state }), [sfx, state]);
  return <SfxContext.Provider value={value}>{children}</SfxContext.Provider>;
}

export function useSfx(): SfxContextValue {
  const value = useContext(SfxContext);
  if (!value) throw new Error('useSfx must be used inside <SfxProvider>');
  return value;
}
