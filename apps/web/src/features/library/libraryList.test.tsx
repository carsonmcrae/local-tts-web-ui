// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Tests for searching and sorting the library.
 * Scope: Filtering by title or file name, an empty search with a way to clear it, each sort order,
 *   the sort remembered on this device (and storage that refuses), and no tools for one document.
 * Does NOT belong: Adding, opening or deleting documents (library.test.tsx).
 */
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@/api/types';
import { documentDetail, renderWithApp } from '@/test/render';
import { LibraryList, sortDocuments } from './LibraryList';

afterEach(() => vi.restoreAllMocks());

/** A library entry (a document's detail includes everything a summary has). */
const summary = (
  title: string,
  createdAt: string,
  percent: number | null,
  filename: string | null,
): DocumentSummary =>
  documentDetail({
    id: (filename ?? title).length.toString(16).padStart(32, '0'),
    title,
    filename,
    createdAt,
    progress:
      percent === null ? null : { segmentIndex: 1, voiceId: null, updatedAt: createdAt, percent },
  });

const books = [
  summary('Wardens of Time', '2026-10-03T00:00:00+00:00', 40, 'wardens.pdf'),
  summary('Atlas 10', '2026-10-01T00:00:00+00:00', null, null), // pasted text has no file name
  summary('Atlas 9', '2026-10-02T00:00:00+00:00', 90, 'notes-on-maps.docx'),
];

function renderList(documents: DocumentSummary[] = books) {
  renderWithApp(<LibraryList documents={documents} />);
  return userEvent.setup();
}

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

describe('Library search and sort', () => {
  it('filters by title or file name and clears an empty search', async () => {
    const user = renderList();
    const search = screen.getByRole('searchbox', { name: 'Search your library' });
    await user.type(search, 'maps');
    expect(titles()).toEqual(['Atlas 9']);
    await user.clear(search);
    await user.type(search, 'dragons');
    expect(screen.getByText('No documents match “dragons”.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(titles()).toHaveLength(3);
  });

  it('sorts four ways and remembers the choice', async () => {
    const user = renderList();
    expect(titles()).toEqual(['Wardens of Time', 'Atlas 10', 'Atlas 9']); // the server's order
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    await user.selectOptions(sort, 'title');
    expect(titles()).toEqual(['Atlas 9', 'Atlas 10', 'Wardens of Time']); // numbers in order
    await user.selectOptions(sort, 'added');
    expect(titles()).toEqual(['Wardens of Time', 'Atlas 9', 'Atlas 10']);
    await user.selectOptions(sort, 'progress');
    expect(titles()).toEqual(['Atlas 10', 'Wardens of Time', 'Atlas 9']);
    expect(localStorage.getItem('ltts.librarySort')).toBe('progress');
  });

  it('starts from the remembered sort, and works without storage', async () => {
    localStorage.setItem('ltts.librarySort', 'title');
    renderList();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('title');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    cleanup();
    const user = renderList();
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(sort).toHaveValue('recent');
    await user.selectOptions(sort, 'added');
    expect(sort).toHaveValue('added');
  });

  it('offers no search or sort for a single document', () => {
    renderList([books[0] as DocumentSummary]);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(sortDocuments(books, 'recent')).toEqual(books);
  });
});
