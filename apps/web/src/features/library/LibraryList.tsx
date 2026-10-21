// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The library's document list, with search and sorting once there is more than one document.
 * Scope: Filters by title or file name as you type; sorts by last read or added (the server's
 *   order), title, date added or how much is left; remembers the sort on this device; explains an
 *   empty search with a way to clear it.
 * Does NOT belong: Uploading (UploadArea) or a document's card (DocumentCard).
 */
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { DocumentSummary } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { DocumentCard } from './DocumentCard';

type Sort = 'recent' | 'title' | 'added' | 'progress';
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Last read or added' },
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Date added' },
  { value: 'progress', label: 'Least listened' },
];
const STORAGE_KEY = 'ltts.librarySort';

function readSort(): Sort {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SORTS.find((sort) => sort.value === stored)?.value ?? 'recent';
  } catch {
    return 'recent';
  }
}

function saveSort(sort: Sort): void {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // Storage unavailable (private window): the sort still applies until the page closes.
  }
}

export function sortDocuments(list: readonly DocumentSummary[], sort: Sort): DocumentSummary[] {
  const sorted = [...list];
  if (sort === 'title')
    sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  if (sort === 'added') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sort === 'progress')
    sorted.sort((a, b) => (a.progress?.percent ?? 0) - (b.progress?.percent ?? 0));
  return sorted;
}

function matchesSearch(doc: DocumentSummary, query: string): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  return `${doc.title} ${doc.filename ?? ''}`.toLocaleLowerCase().includes(wanted);
}

export function LibraryList({ documents }: Readonly<{ documents: readonly DocumentSummary[] }>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(readSort);
  const shown = sortDocuments(documents, sort).filter((doc) => matchesSearch(doc, query));
  const tools = documents.length > 1;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">All documents</h2>
        <span className="text-[13px] text-muted">
          {documents.length} total · drag files anywhere to add
        </span>
      </div>
      {tools ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
            />
            <Input
              type="search"
              aria-label="Search your library"
              placeholder="Search by title or file name"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            aria-label="Sort by"
            className="sm:w-52"
            value={sort}
            onChange={(event) => {
              const next = event.target.value as Sort;
              setSort(next);
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
      ) : null}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          <p>No documents match “{query.trim()}”.</p>
          <Button size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </>
  );
}
