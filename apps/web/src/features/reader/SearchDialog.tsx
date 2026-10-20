// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Find words in a document and jump to them.
 * Scope: A search box (results follow the typing after a short pause), how many sentences match,
 *   and each match with its section and the found words marked; choosing one jumps there.
 * Does NOT belong: Matching (the server) or player coordination (ReaderPage).
 */
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { useDocumentSearch } from '@/api/readingQueries';
import type { SectionOut } from '@/api/types';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';

const DEBOUNCE_MS = 250;

function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** `text` with every case-insensitive occurrence of `query` wrapped in <mark> (plain text matching). */
export function markMatches(text: string, query: string): ReactNode[] {
  const wanted = query.trim().split(/\s+/).join(' ').toLowerCase();
  if (!wanted) return [text];
  const haystack = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = haystack.indexOf(wanted); at !== -1; at = haystack.indexOf(wanted, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-highlight px-0.5 text-text">
        {text.slice(at, at + wanted.length)}
      </mark>,
    );
    from = at + wanted.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

interface SearchDialogProps {
  documentId: string;
  sections: readonly SectionOut[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: (segmentIndex: number, sectionIndex: number) => void;
}

export function SearchDialog({
  documentId,
  sections,
  open,
  onOpenChange,
  onJump,
}: Readonly<SearchDialogProps>) {
  const [text, setText] = useState('');
  const query = useDebounced(text, DEBOUNCE_MS);
  const results = useDocumentSearch(documentId, query);
  const data = query.trim() ? results.data : undefined;
  const sectionTitle = (index: number) => sections.find((s) => s.index === index)?.title;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Search this document" size="lg">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
          />
          <Input
            type="search"
            aria-label="Search for"
            placeholder="A word, name or phrase"
            className="pl-9"
            maxLength={200}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <div aria-live="polite" className="flex items-center gap-2 text-[13px] text-muted">
          {results.isFetching ? <Spinner size={14} /> : null}
          {data ? summary(data.total, data.hits.length) : null}
        </div>
        {results.isError ? <Banner tone="error">{describeError(results.error)}</Banner> : null}
        {data && data.hits.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {data.hits.map((hit) => (
              <li key={hit.segmentIndex}>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm leading-snug hover:bg-surface-2"
                  onClick={() => onJump(hit.segmentIndex, hit.sectionIndex)}
                >
                  <span className="block text-xs text-subtle">
                    {sectionTitle(hit.sectionIndex)}
                  </span>
                  <span>{markMatches(hit.text, data.query)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Dialog>
  );
}

function summary(total: number, shown: number): string {
  if (total === 0) return 'No sentences match.';
  const matches = `${total} matching sentence${total === 1 ? '' : 's'}`;
  return shown < total ? `${matches}, showing the first ${shown}` : matches;
}
