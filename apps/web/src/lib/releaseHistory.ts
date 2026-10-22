// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TTSNative's published release notes, available offline.
 * Scope: The notes built into this copy of the app (from docs/releases/ at build time, newest first),
 *   reading the Markdown notes an update check brings for a newer version, the notes for a version,
 *   whether a version is a development build, and names and dates written out for people.
 * Does NOT belong: Fetching anything (the desktop app's update check does that) or how notes are shown.
 */

interface ReleaseSection {
  key: string;
  title: string;
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  date: string;
  /** The product name this version was released under, when it wasn't TTSNative. */
  publishedAs: string | null;
  summary: string;
  sections: ReleaseSection[];
}

declare const __RELEASE_HISTORY__: ReleaseNotes[] | undefined;

export const RELEASES_URL = 'https://github.com/carsonmcrae/ttsnative/releases';

export function releaseHistory(): ReleaseNotes[] {
  return __RELEASE_HISTORY__ ?? [];
}

/** "TTSNative 2.1.0", or the name a version was released under ("Local TTS 2.0.0"). */
export function releaseName(release: Pick<ReleaseNotes, 'version' | 'publishedAs'>): string {
  return `${release.publishedAs ?? 'TTSNative'} ${release.version}`;
}

/** `2.1.0` for `2.1.0-dev.3+feat.abc`. */
export function baseVersion(version: string): string {
  return version.replace(/[-+].*$/, '');
}

export function isDevelopmentBuild(version: string): boolean {
  return /[-+]/.test(version);
}

export function notesFor(version: string): ReleaseNotes | undefined {
  return releaseHistory().find((release) => release.version === version);
}

/** Notes in the Markdown an update check returns: a summary, then `## Title` and `- item` lines. */
export function parseReleaseMarkdown(
  version: string,
  date: string | null,
  markdown: string,
): ReleaseNotes {
  const sections: ReleaseSection[] = [];
  const summary: string[] = [];
  for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      const title = heading[1].trim();
      sections.push({ key: title.toLowerCase(), title, items: [] });
    } else if (item?.[1] && sections.length) {
      sections.at(-1)?.items.push(item[1].trim());
    } else if (!sections.length && line.trim()) {
      summary.push(line.trim());
    }
  }
  return {
    version,
    date: date ?? '',
    publishedAs: null,
    summary: summary.join(' '),
    sections: sections.filter((section) => section.items.length),
  };
}

/** "October 19, 2026" (in UTC, so the date never shifts with the time zone). */
export function formatReleaseDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}
