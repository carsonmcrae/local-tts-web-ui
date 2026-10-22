// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A pretend pronunciation dictionary for the pronunciation tests.
 * Scope: Rule fixtures and the dictionary's routes over an in-memory list (list, add, change,
 *   remove, preview clips), and the JSON bodies a test sent to one route. Test code only.
 * Does NOT belong: The tests themselves or the app.
 */
import { json } from '@/test/render';
import type { Pronunciation } from '@/api/types';

export const WARDENS = 'b'.repeat(32);

export const rule = (
  word: string,
  sayAs: string,
  { matchCase = false, documentId = null as string | null | undefined } = {},
): Pronunciation => ({
  id: `${word}${documentId ? '-doc' : '-all'}`.padEnd(32, '0'),
  word,
  sayAs,
  matchCase,
  documentId: documentId ?? null,
  documentTitle: documentId ? 'Wardens' : null,
  createdAt: '2026-10-20T10:00:00+00:00',
});

/** The JSON a request carried, read as the server reads it. */
async function bodyOf<T>(init: RequestInit): Promise<T> {
  return (await new Response(init.body).json()) as T;
}

/** A clip for each word or respelling, as the server answers a preview. */
async function previewClip(_url: URL, init: RequestInit) {
  const body = await bodyOf<{ text: string; respelling: boolean }>(init);
  const kind = body.respelling ? 'respelled' : 'written';
  return { audioUrl: `/api/audio/${kind}-${encodeURIComponent(body.text)}`, durationS: 0.8 };
}

/** The dictionary's routes over ``state.rules``, as the server would keep them. */
export function dictionaryRoutes(state: { rules: Pronunciation[] }) {
  return {
    'GET /api/pronunciations': () => state.rules,
    'POST /api/pronunciations': async (_url: URL, init: RequestInit) => {
      const body = await bodyOf<Pronunciation>(init);
      const added = rule(body.word, body.sayAs, body);
      state.rules = [...state.rules, added];
      return json(added, 201);
    },
    'PUT /api/pronunciations/': async (url: URL, init: RequestInit) => {
      const body = await bodyOf<Pronunciation>(init);
      const id = url.pathname.split('/').pop();
      state.rules = state.rules.map((r) =>
        r.id === id ? { ...r, ...body, documentTitle: body.documentId ? 'Wardens' : null } : r,
      );
      return state.rules.find((r) => r.id === id);
    },
    'DELETE /api/pronunciations/': (url: URL) => {
      state.rules = state.rules.filter((r) => r.id !== url.pathname.split('/').pop());
      return new Response(null, { status: 204 });
    },
    'POST /api/pronunciation-preview': previewClip,
  };
}

/** The JSON bodies sent with ``method`` to paths starting with ``path``, oldest first. */
export function sent(
  calls: readonly { method: string; path: string; body: unknown }[],
  method: string,
  path: string,
) {
  return calls
    .filter((call) => call.method === method && call.path.startsWith(path))
    .map((call) => JSON.parse(String(call.body)) as Record<string, unknown>);
}
