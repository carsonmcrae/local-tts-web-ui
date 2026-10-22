// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the library's views and filters as pure functions.
 * Scope: Parsing a view from the address and writing it back, which documents each view shows and in
 *   what order, titles and empty-state copy, the filters (search over title, author, file name and
 *   tags; genre, type and progress; every sort), the remembered sort, and tag parsing.
 * Does NOT belong: Rendering (libraryList.test.tsx, libraryRail.test.tsx, organize.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@/api/types';
import { documentDetail } from '@/test/render';
import {
  applyFilters,
  defaultFilters,
  hasNarrowing,
  readSort,
  saveSort,
  sortDocuments,
} from './LibraryFilters';
import { parseTags } from './OrganizeDialogs';
import { folderPath, possibleParents } from './RailDialogs';
import {
  ALL,
  emptyCopy,
  isFinished,
  parseView,
  sameView,
  selectDocuments,
  viewSearch,
  viewTitle,
} from './views';

afterEach(() => vi.restoreAllMocks());

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);
const NOW = new Date('2026-10-21T12:00:00+00:00').getTime();

const doc = (id: string, overrides: Partial<DocumentSummary> = {}): DocumentSummary => ({
  ...documentDetail(),
  id,
  ...overrides,
});
const progress = (percent: number, updatedAt = '2026-10-20T00:00:00+00:00') => ({
  segmentIndex: 1,
  voiceId: null,
  updatedAt,
  percent,
});
const shelf = (overrides: Partial<DocumentSummary['shelf']>) => ({
  ...documentDetail().shelf,
  ...overrides,
});

const docs = [
  doc('1'.repeat(32), {
    title: 'Wardens of Time',
    author: 'Mira Vale',
    createdAt: '2026-10-20T00:00:00+00:00',
    progress: progress(40, '2026-10-21T00:00:00+00:00'),
    shelf: shelf({
      favorite: true,
      folderId: ID_A,
      genres: ['fantasy'],
      documentType: 'novel',
      tags: ['Evening'],
    }),
  }),
  doc('2'.repeat(32), {
    title: 'Atlas 10',
    author: null,
    filename: null,
    createdAt: '2026-09-01T00:00:00+00:00',
    progress: null,
    shelf: shelf({ collectionIds: [ID_B], genres: ['science'], documentType: 'report' }),
  }),
  doc('3'.repeat(32), {
    title: 'Atlas 9',
    author: 'Mira Vale',
    filename: 'notes-on-maps.docx',
    createdAt: '2026-10-19T00:00:00+00:00',
    progress: progress(100),
    shelf: shelf({ favorite: true }),
  }),
  doc('4'.repeat(32), {
    title: 'Letters',
    author: 'Ann Field',
    createdAt: '2026-10-18T00:00:00+00:00',
    progress: progress(10, '2026-10-19T00:00:00+00:00'),
  }),
];
const titles = (list: readonly DocumentSummary[]) => list.map((item) => item.title);

describe('Library views', () => {
  it('reads a view from the address and writes it back', () => {
    expect(parseView(new URLSearchParams(''))).toEqual(ALL);
    expect(parseView(new URLSearchParams('view=favorites'))).toEqual({ kind: 'favorites' });
    expect(parseView(new URLSearchParams('view=continue'))).toEqual({ kind: 'continue' });
    expect(parseView(new URLSearchParams('view=recent'))).toEqual({ kind: 'recent' });
    expect(parseView(new URLSearchParams('view=nonsense'))).toEqual(ALL);
    expect(parseView(new URLSearchParams(`folder=${ID_A}`))).toEqual({ kind: 'folder', id: ID_A });
    expect(parseView(new URLSearchParams('folder=../etc'))).toEqual(ALL);
    expect(parseView(new URLSearchParams(`collection=${ID_B}`))).toEqual({
      kind: 'collection',
      id: ID_B,
    });
    expect(parseView(new URLSearchParams('collection=x'))).toEqual(ALL);
    expect(viewSearch(ALL)).toBe('');
    expect(viewSearch({ kind: 'recent' })).toBe('?view=recent');
    expect(viewSearch({ kind: 'folder', id: ID_A })).toBe(`?folder=${ID_A}`);
    expect(viewSearch({ kind: 'collection', id: ID_B })).toBe(`?collection=${ID_B}`);
    expect(
      sameView({ kind: 'folder', id: ID_A }, parseView(new URLSearchParams(`folder=${ID_A}`))),
    ).toBe(true);
    expect(sameView(ALL, { kind: 'recent' })).toBe(false);
  });

  it('selects and orders the documents of each view', () => {
    expect(titles(selectDocuments(docs, ALL))).toEqual(titles(docs));
    expect(titles(selectDocuments(docs, { kind: 'continue' }))).toEqual([
      'Wardens of Time',
      'Letters',
    ]);
    expect(titles(selectDocuments(docs, { kind: 'favorites' }))).toEqual([
      'Wardens of Time',
      'Atlas 9',
    ]);
    expect(titles(selectDocuments(docs, { kind: 'recent' }, NOW))).toEqual([
      'Wardens of Time',
      'Atlas 9',
      'Letters',
    ]);
    expect(titles(selectDocuments(docs, { kind: 'folder', id: ID_A }))).toEqual([
      'Wardens of Time',
    ]);
    expect(titles(selectDocuments(docs, { kind: 'collection', id: ID_B }))).toEqual(['Atlas 10']);
    expect(isFinished(docs[2] as DocumentSummary)).toBe(true);
    expect(isFinished(docs[1] as DocumentSummary)).toBe(false);
  });

  it('names views and explains empty ones', () => {
    const folders = [
      { id: ID_A, parentId: null, name: 'Fantasy', position: 1, documentCount: 1, createdAt: '' },
    ];
    const collections = [
      { id: ID_B, name: 'Evening', description: '', position: 1, documentCount: 1, createdAt: '' },
    ];
    expect(viewTitle(ALL, folders, collections)).toBe('All documents');
    expect(viewTitle({ kind: 'favorites' }, folders, collections)).toBe('Favourites');
    expect(viewTitle({ kind: 'folder', id: ID_A }, folders, collections)).toBe('Fantasy');
    expect(viewTitle({ kind: 'folder', id: ID_B }, folders, collections)).toBe('Folder');
    expect(viewTitle({ kind: 'collection', id: ID_B }, folders, collections)).toBe('Evening');
    expect(viewTitle({ kind: 'collection', id: ID_A }, folders, collections)).toBe('Collection');
    for (const view of [
      ALL,
      { kind: 'continue' },
      { kind: 'favorites' },
      { kind: 'recent' },
    ] as const) {
      expect(emptyCopy(view).title).toBeTruthy();
    }
    expect(emptyCopy({ kind: 'folder', id: ID_A }).title).toBe('This folder is empty');
    expect(emptyCopy({ kind: 'collection', id: ID_B }).hint).toMatch(/any number of collections/);
  });
});

describe('Library filters', () => {
  it('searches titles, authors, file names and tags', () => {
    const base = { ...defaultFilters(), sort: 'recent' as const };
    expect(titles(applyFilters(docs, { ...base, query: 'maps' }))).toEqual(['Atlas 9']);
    expect(titles(applyFilters(docs, { ...base, query: 'MIRA' }))).toEqual([
      'Wardens of Time',
      'Atlas 9',
    ]);
    expect(titles(applyFilters(docs, { ...base, query: 'evening' }))).toEqual(['Wardens of Time']);
    expect(titles(applyFilters(docs, { ...base, query: '   ' }))).toHaveLength(4);
    expect(hasNarrowing(base)).toBe(false);
    expect(hasNarrowing({ ...base, genre: 'fantasy' })).toBe(true);
  });

  it('filters by genre, type and progress', () => {
    const base = defaultFilters();
    expect(titles(applyFilters(docs, { ...base, genre: 'science' }))).toEqual(['Atlas 10']);
    expect(titles(applyFilters(docs, { ...base, type: 'novel' }))).toEqual(['Wardens of Time']);
    expect(titles(applyFilters(docs, { ...base, status: 'unread' }))).toEqual(['Atlas 10']);
    expect(titles(applyFilters(docs, { ...base, status: 'reading' }))).toEqual([
      'Wardens of Time',
      'Letters',
    ]);
    expect(titles(applyFilters(docs, { ...base, status: 'finished' }))).toEqual(['Atlas 9']);
  });

  it('sorts five ways', () => {
    expect(titles(sortDocuments(docs, 'recent'))).toEqual(titles(docs));
    expect(titles(sortDocuments(docs, 'title'))).toEqual([
      'Atlas 9',
      'Atlas 10',
      'Letters',
      'Wardens of Time',
    ]);
    expect(titles(sortDocuments(docs, 'author'))).toEqual([
      'Letters',
      'Atlas 9',
      'Wardens of Time',
      'Atlas 10',
    ]);
    const unsigned = [
      doc(ID_B, { title: 'Zed', author: null }),
      doc(ID_A, { title: 'Alpha', author: null }),
    ];
    expect(titles(sortDocuments(unsigned, 'author'))).toEqual(['Alpha', 'Zed']); // no author: by title
    const same = [docs[0], docs[2]] as DocumentSummary[]; // the same author: titles decide
    expect(titles(sortDocuments(same, 'author'))).toEqual(['Atlas 9', 'Wardens of Time']);
    expect(titles(sortDocuments(docs, 'added'))).toEqual([
      'Wardens of Time',
      'Atlas 9',
      'Letters',
      'Atlas 10',
    ]);
    expect(titles(sortDocuments(docs, 'progress'))).toEqual([
      'Atlas 10',
      'Letters',
      'Wardens of Time',
      'Atlas 9',
    ]);
  });

  it('remembers the sort on this device, and copes without storage', () => {
    expect(readSort()).toBe('recent');
    saveSort('author');
    expect(readSort()).toBe('author');
    localStorage.setItem('ltts.librarySort', 'bogus');
    expect(readSort()).toBe('recent');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readSort()).toBe('recent');
    expect(() => saveSort('title')).not.toThrow();
  });
});

describe('Organising helpers', () => {
  it('parses typed tags', () => {
    expect(parseTags(' evening,  book   club , Evening, ,x')).toEqual([
      'evening',
      'book club',
      'x',
    ]);
    expect(parseTags(Array.from({ length: 40 }, (_, n) => `t${n}`).join(','))).toHaveLength(30);
  });

  it('knows where a folder may go and how its path reads', () => {
    const c = 'c'.repeat(32);
    const folders = [
      { id: ID_A, parentId: null, name: 'Fiction', position: 1, documentCount: 0, createdAt: '' },
      { id: ID_B, parentId: ID_A, name: 'Fantasy', position: 1, documentCount: 0, createdAt: '' },
      { id: c, parentId: ID_B, name: 'Dragons', position: 1, documentCount: 0, createdAt: '' },
    ];
    expect(possibleParents(folders, null).map((f) => f.name)).toEqual([
      'Fiction',
      'Fantasy',
      'Dragons',
    ]);
    expect(possibleParents(folders, ID_A)).toEqual([]);
    expect(possibleParents(folders, ID_B).map((f) => f.name)).toEqual(['Fiction']);
    expect(folderPath(folders, c)).toBe('Fiction / Fantasy / Dragons');
    expect(folderPath(folders, 'missing')).toBe('');
  });
});
