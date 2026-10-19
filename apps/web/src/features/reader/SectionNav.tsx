/**
 * Purpose: Table of contents for chapters, sections or pages.
 * Scope: Lists sections with the one being viewed and the one being spoken marked; jumping to a
 *   section shows it and moves the playback position there.
 * Does NOT belong: Section text (DocumentText).
 */
import { Volume2 } from 'lucide-react';
import type { SectionOut } from '@/api/types';
import { cn } from '@/lib/cn';

interface SectionNavProps {
  sections: readonly SectionOut[];
  viewed: number;
  speaking: number | null;
  onSelect: (section: SectionOut) => void;
}

export function SectionNav({ sections, viewed, speaking, onSelect }: Readonly<SectionNavProps>) {
  return (
    <nav aria-label="Contents">
      <ol className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li key={section.index}>
            <button
              type="button"
              onClick={() => onSelect(section)}
              aria-current={section.index === viewed ? 'location' : undefined}
              className={cn(
                'flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-[13px] leading-snug transition-colors',
                section.index === viewed
                  ? 'bg-accent-soft font-medium text-accent-text'
                  : 'text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-70">
                {section.index + 1}
              </span>
              <span className="line-clamp-2 flex-1">{section.title}</span>
              {section.index === speaking ? (
                <Volume2
                  size={14}
                  className="mt-0.5 shrink-0 text-accent-text"
                  aria-label="Now playing"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
