// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The two faces of the library: your documents, and the books that come with the app.
 * Scope: A pair of links styled as tabs, marking the current one, shown under both pages' headers so
 *   the main navigation keeps its five items.
 * Does NOT belong: The pages themselves (LibraryPage, ExplorePage).
 */
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'library', to: '/library', label: 'My library' },
  { id: 'explore', to: '/explore', label: 'Explore included books' },
] as const;

export function LibraryTabs({ current }: Readonly<{ current: 'library' | 'explore' }>) {
  return (
    <nav aria-label="Library sections" className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          aria-current={tab.id === current ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            tab.id === current
              ? 'border-accent text-accent-text'
              : 'border-transparent text-muted hover:text-text',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
