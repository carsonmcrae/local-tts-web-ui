// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One version's release notes, the same way everywhere they appear.
 * Scope: Heading with version, date and an earlier product name, the plain-language summary, the New /
 *   Improved / Fixed / Security & reliability lists, and a link to the GitHub release.
 * Does NOT belong: Choosing which notes to show (ReleaseHistoryDialog, UpdateDialog, WhatsNew).
 */
import { ExternalLink } from 'lucide-react';
import type { ReleaseNotes } from '@/lib/releaseHistory';
import { formatReleaseDate, releaseUrl } from '@/lib/releaseHistory';

interface ReleaseNotesViewProps {
  release: ReleaseNotes;
  /** Show the version and date as a heading (lists of several releases). */
  heading?: boolean;
}

export function ReleaseNotesView({ release, heading = false }: Readonly<ReleaseNotesViewProps>) {
  const date = formatReleaseDate(release.date);
  return (
    <article aria-label={`TTSNative ${release.version}`} className="flex flex-col gap-3 text-sm">
      {heading ? (
        <header>
          <h3 className="text-base font-semibold tracking-tight">
            {release.publishedAs ? `${release.publishedAs} ` : 'TTSNative '}
            {release.version}
          </h3>
          {date ? <p className="text-[13px] text-muted">{date}</p> : null}
        </header>
      ) : null}
      {release.summary ? <p className="leading-relaxed">{release.summary}</p> : null}
      {release.sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <h4 className="mb-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
            {section.title}
          </h4>
          <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <a
        href={releaseUrl(release.version)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent-text underline-offset-2 hover:underline"
      >
        Release page on GitHub <ExternalLink size={13} aria-hidden="true" />
      </a>
    </article>
  );
}
