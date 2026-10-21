// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Searching, filtering and sorting the documents of a library view.
 * Scope: The filter state (search text, sort, genre, type, progress), the pure functions that apply
 *   it to a list, the sort remembered on this device, and the toolbar that edits it: a search box,
 *   a sort menu and three narrow selects. Search covers titles, authors, file names and tags.
 * Does NOT belong: Choosing the view (views.ts) or drawing the documents (LibraryList.tsx).
 */
import { Search } from 'lucide-react';
import type { DocumentSummary, Genre, WorkType } from '@/api/types';
import { Input, Select } from '@/components/ui/Field';
import { isFinished, isResumable } from './views';
import { GENRES, WORK_TYPES } from './vocabulary';

export type Sort = 'recent' | 'title' | 'author' | 'added' | 'progress';
type Status = 'any' | 'unread' | 'reading' | 'finished';

export interface Filters {
  query: string;
  sort: Sort;
  genre: Genre | '';
  type: WorkType | '';
  status: Status;
}

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Last read or added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'added', label: 'Date added' },
  { value: 'progress', label: 'Least listened' },
];
const STATUSES: readonly { value: Status; label: string }[] = [
  { value: 'any', label: 'Any progress' },
  { value: 'unread', label: 'Not started' },
  { value: 'reading', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
];
const STORAGE_KEY = 'ltts.librarySort';

export function readSort(): Sort {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SORTS.find((sort) => sort.value === stored)?.value ?? 'recent';
  } catch {
    return 'recent';
  }
}

export function saveSort(sort: Sort): void {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // Storage unavailable (private window): the sort still applies until the page closes.
  }
}

export function defaultFilters(): Filters {
  return { query: '', sort: readSort(), genre: '', type: '', status: 'any' };
}

const byTitle = (a: DocumentSummary, b: DocumentSummary) =>
  a.title.localeCompare(b.title, undefined, { numeric: true });
const authorKey = (doc: DocumentSummary) => doc.author ?? '';

export function sortDocuments(list: readonly DocumentSummary[], sort: Sort): DocumentSummary[] {
  const sorted = [...list];
  if (sort === 'title') sorted.sort(byTitle);
  if (sort === 'author')
    sorted.sort(
      (a, b) =>
        // Documents without an author come last, in title order.
        Number(!a.author) - Number(!b.author) ||
        authorKey(a).localeCompare(authorKey(b)) ||
        byTitle(a, b),
    );
  if (sort === 'added') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sort === 'progress')
    sorted.sort((a, b) => (a.progress?.percent ?? 0) - (b.progress?.percent ?? 0));
  return sorted;
}

function matchesSearch(doc: DocumentSummary, query: string): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  if (!wanted) return true;
  const haystack = [doc.title, doc.author ?? '', doc.filename ?? '', ...doc.shelf.tags]
    .join(' ')
    .toLocaleLowerCase();
  return haystack.includes(wanted);
}

function matchesStatus(doc: DocumentSummary, status: Status): boolean {
  if (status === 'unread') return !doc.progress;
  if (status === 'reading') return isResumable(doc);
  if (status === 'finished') return isFinished(doc);
  return true;
}

/** The documents that pass every filter, in the chosen order. */
export function applyFilters(
  list: readonly DocumentSummary[],
  filters: Filters,
): DocumentSummary[] {
  const kept = list.filter(
    (doc) =>
      matchesSearch(doc, filters.query) &&
      (!filters.genre || doc.shelf.genres.includes(filters.genre)) &&
      (!filters.type || doc.shelf.documentType === filters.type) &&
      matchesStatus(doc, filters.status),
  );
  return sortDocuments(kept, filters.sort);
}

/** Whether one of the selects (not the search box) narrows the list. */
export function hasNarrowing(filters: Filters): boolean {
  return Boolean(filters.genre || filters.type || filters.status !== 'any');
}

export function LibraryFilterBar({
  filters,
  onChange,
}: Readonly<{ filters: Filters; onChange: (filters: Filters) => void }>) {
  const set = (change: Partial<Filters>) => onChange({ ...filters, ...change });
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
          />
          <Input
            type="search"
            aria-label="Search your library"
            placeholder="Search by title, author, file name or tag"
            className="pl-9"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
          />
        </div>
        <Select
          aria-label="Sort by"
          className="sm:w-52"
          value={filters.sort}
          onChange={(event) => {
            const next = event.target.value as Sort;
            set({ sort: next });
            saveSort(next);
          }}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          aria-label="Genre"
          value={filters.genre}
          onChange={(event) => set({ genre: event.target.value as Genre | '' })}
        >
          <option value="">Any genre</option>
          {GENRES.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Type"
          value={filters.type}
          onChange={(event) => set({ type: event.target.value as WorkType | '' })}
        >
          <option value="">Any type</option>
          {WORK_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Progress"
          value={filters.status}
          onChange={(event) => set({ status: event.target.value as Status })}
        >
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
