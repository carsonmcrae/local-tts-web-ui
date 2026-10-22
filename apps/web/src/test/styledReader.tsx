// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Shared fixtures for the reader's styling and cast tests.
 * Scope: A four-sentence document, its styling and voices, one character (Nicole) and one saved cast,
 *   a small stateful fake server for the styling, the cast, the characters and the saved casts, the
 *   reader rendered over it with its player exposed, a text-selection helper and a refusing route.
 * Does NOT belong: Test cases (features/reader/styling.test.tsx, features/reader/cast.test.tsx).
 */
import { act, screen } from '@testing-library/react';
import type { CastPreset, Character, DocumentStyles } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import ReaderPage from '@/features/reader/ReaderPage';
import { documentDetail, json, mockReaderApi, PlayerSpy, renderWithApp, voice } from './render';

export const styledDoc = documentDetail({ segmentCount: 4, sections: [] });

export const SERIES: CastPreset = {
  id: 'p'.repeat(32),
  name: 'Series',
  characters: { Nicole: 'custom:sam' },
  createdAt: 'now',
};

/** A route that refuses whatever is asked, with `message`. */
export const refused = (message: string) => () =>
  json({ error: { code: 'refused', message } }, 423);

export const styles = (overrides: Partial<DocumentStyles> = {}): DocumentStyles => ({
  segments: [],
  dialogueVoiceId: null,
  splitDialogue: true,
  revision: 'r1',
  ...overrides,
});

export const VOICES = [
  voice(),
  voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)' }),
  voice({ id: 'custom:sam', name: 'Sam', category: 'custom', engineId: 'chatterbox' }),
];

const NICOLE: Character = {
  name: 'Nicole',
  lines: 3,
  sample: '"Ready?" asked Nicole.',
  voiceId: null,
};

type Player = ReturnType<typeof usePlayer>;

/** The reader over a fake server that keeps the styling, the cast, the characters and saved casts. */
export function openStyledReader(
  initial: DocumentStyles = styles(),
  extra: Record<string, unknown> = {},
) {
  const doc = styledDoc;
  const state = {
    styles: initial,
    characters: [NICOLE] as Character[],
    presets: [] as CastPreset[],
  };
  const respond = (_url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const cast = 'dialogueVoiceId' in body || 'splitDialogue' in body ? body : {};
    state.styles = { ...state.styles, revision: 'r2', ...cast };
    return state.styles;
  };
  const assign = (_url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { name: string; voiceId: string | null };
    const others = state.characters.filter((character) => character.name !== body.name);
    const known = state.characters.find((character) => character.name === body.name);
    state.characters = [...others, { ...(known ?? { lines: 0, sample: null }), ...body }];
    return state.characters;
  };
  const api = mockReaderApi(doc, {
    'GET /api/voices': VOICES,
    [`GET /api/documents/${doc.id}/styles`]: () => state.styles,
    [`PUT /api/documents/${doc.id}/styles`]: respond,
    [`PUT /api/documents/${doc.id}/cast`]: respond,
    [`GET /api/documents/${doc.id}/characters`]: () => state.characters,
    [`PUT /api/documents/${doc.id}/characters`]: assign,
    'GET /api/cast-presets': () => state.presets,
    [`POST /api/documents/${doc.id}/cast-presets`]: () => {
      state.presets = [SERIES];
      return SERIES;
    },
    [`POST /api/documents/${doc.id}/cast-presets/`]: () => {
      // Applying a saved cast gives its characters their voices.
      state.characters = state.characters.map((character) => ({
        ...character,
        voiceId: SERIES.characters[character.name] ?? character.voiceId,
      }));
      return state.characters;
    },
    'DELETE /api/cast-presets/': () => {
      state.presets = [];
      return new Response(null, { status: 204 });
    },
    ...extra,
  });
  const spy = { player: null as Player | null };
  const page = (
    <>
      <ReaderPage />
      <PlayerSpy onPlayer={(player) => (spy.player = player)} />
    </>
  );
  const { media } = renderWithApp(page, { path: '/read/:documentId', route: `/read/${doc.id}` });
  return { ...api, state, media, controller: () => (spy.player as Player).controller };
}

/** Selects the text from the start of one sentence to the end of another and announces it. */
export function selectSentences(first: HTMLElement, last: HTMLElement) {
  const range = document.createRange();
  range.setStart(first.firstChild!, 0);
  range.setEnd(last.firstChild!, last.textContent.length);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

export const sentence = (text: string) => screen.getByText(text, { selector: '.reader-seg' });
