// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Turn a document's bookmarks into a Markdown file of notes and save it.
 * Scope: A Markdown outline (document title, then each bookmarked sentence as a quote under its
 *   section, followed by its note) and a browser download of that text.
 * Does NOT belong: Fetching bookmarks (readingQueries) or how they are listed (BookmarkList).
 */
import type { Bookmark, SectionOut } from '@/api/types';

export function notesMarkdown(
  title: string,
  sections: readonly Pick<SectionOut, 'index' | 'title'>[],
  bookmarks: readonly Bookmark[],
): string {
  const lines = [`# ${title}`, '', `Bookmarks and notes (${bookmarks.length})`];
  let section: number | null = null;
  for (const bookmark of bookmarks) {
    if (bookmark.sectionIndex !== section) {
      section = bookmark.sectionIndex;
      const heading = sections.find((s) => s.index === section)?.title ?? `Section ${section + 1}`;
      lines.push('', `## ${heading}`);
    }
    lines.push('', `> ${bookmark.text}`);
    if (bookmark.note) lines.push('', bookmark.note);
  }
  return `${lines.join('\n')}\n`;
}

/** Offer `text` as a download named `filename`. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function notesFilename(title: string): string {
  const base = title.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'Document';
  return `${base} - notes.md`;
}
