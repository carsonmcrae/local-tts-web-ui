// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Explore — the public-domain books that come with TTSNative.
 * Scope: Featured experiences first, then the works grouped by kind (novels, short stories, poetry,
 *   essays, memoirs), a search box over titles, authors and descriptions, a switch to show hidden
 *   works, the credits dialog, and loading and error states. Opening a book adds it to the library
 *   the first time; nothing is downloaded.
 * Does NOT belong: One book's card (WorkCard.tsx) or the library itself (features/library).
 */
import { BookMarked, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useBundledWorks, useCatalogCredits } from '@/api/catalogQueries';
import { describeError } from '@/api/client';
import type { BundledWork } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { Input, Switch } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { LibraryTabs } from '@/features/library/LibraryTabs';
import { WorkCard } from './WorkCard';

type Group = { title: string; types: readonly BundledWork['documentType'][] };

const GROUPS: readonly Group[] = [
  { title: 'Novels and novellas', types: ['novel', 'novella'] },
  { title: 'Short stories', types: ['short-story', 'short-story-collection'] },
  { title: 'Poetry', types: ['poem', 'poetry-collection'] },
  { title: 'Essays and philosophy', types: ['essay', 'research-paper', 'report'] },
  { title: 'Memoirs and biography', types: ['memoir', 'biography'] },
  { title: 'Other', types: ['personal-document', 'other'] },
];

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function matchesWork(work: BundledWork, query: string): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  if (!wanted) return true;
  return [work.title, ...work.authors, work.description ?? '']
    .join(' ')
    .toLocaleLowerCase()
    .includes(wanted);
}

/** The works in display order: featured ones first, then by sort title within each group. */
export function groupWorks(
  works: readonly BundledWork[],
): { title: string; works: BundledWork[] }[] {
  const bySort = (a: BundledWork, b: BundledWork) => a.sortTitle.localeCompare(b.sortTitle);
  const featured = works.filter((work) => work.featured).sort(bySort);
  const groups = GROUPS.map((group) => ({
    title: group.title,
    works: works.filter((work) => group.types.includes(work.documentType)).sort(bySort),
  })).filter((group) => group.works.length);
  return featured.length ? [{ title: 'Featured experiences', works: featured }, ...groups] : groups;
}

function CreditsDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const credits = useCatalogCredits(open);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Where these books come from"
      description="Every book is public domain in the United States; this is the record of each edition, its cover, and where else it is known to be free."
      size="lg"
    >
      {credits.isPending ? <Skeleton className="h-40" /> : null}
      {credits.isError ? <Banner tone="error">{describeError(credits.error)}</Banner> : null}
      {credits.data ? (
        <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
          {credits.data}
        </pre>
      ) : null}
    </Dialog>
  );
}

export default function ExplorePage() {
  const works = useBundledWorks();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [showHidden, setShowHidden] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const shown = (works.data ?? []).filter(
    (work) => (showHidden || !work.hidden) && matchesWork(work, query),
  );
  const hiddenCount = (works.data ?? []).filter((work) => work.hidden).length;
  const groups = groupWorks(shown);
  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Explore"
        description="Public-domain books that come with TTSNative. Open one to add it to your library; nothing is downloaded."
        actions={
          <Button
            variant="ghost"
            icon={<BookMarked size={16} />}
            onClick={() => setCreditsOpen(true)}
          >
            Where these books come from
          </Button>
        }
      />
      <LibraryTabs current="explore" />
      {works.isPending ? (
        <StatusRegion label="Loading the included books" className="flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-40" />
          ))}
        </StatusRegion>
      ) : null}
      {works.isError ? (
        <Banner
          tone="error"
          title="Couldn't load the included books"
          action={
            <Button size="sm" onClick={() => void works.refetch()}>
              Retry
            </Button>
          }
        >
          {describeError(works.error)}
        </Banner>
      ) : null}
      {works.data ? (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
              />
              <Input
                type="search"
                aria-label="Search the included books"
                placeholder="Search by title, author or description"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {hiddenCount ? (
              <div className="sm:w-64">
                <Switch
                  label="Show hidden books"
                  description={`${hiddenCount} hidden`}
                  checked={showHidden}
                  onCheckedChange={setShowHidden}
                />
              </div>
            ) : null}
          </div>
          {groups.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-line-strong p-8 text-center text-sm text-muted">
              No included book matches “{query.trim()}”.
            </p>
          ) : null}
          {groups.map((group) => (
            <section
              key={group.title}
              aria-labelledby={`explore-${slug(group.title)}`}
              className="mb-10"
            >
              <h2
                id={`explore-${slug(group.title)}`}
                className="mb-3 text-base font-semibold tracking-tight"
              >
                {group.title}
              </h2>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {group.works.map((work) => (
                  <WorkCard key={work.workId} work={work} />
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : null}
      <CreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} />
    </div>
  );
}
