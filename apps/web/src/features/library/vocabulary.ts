// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The names people see for the library's genres and document types.
 * Scope: Display labels and display order for the server's fixed genre and type vocabularies
 *   (ADR-24), and the type and genre labels the cards show.
 * Does NOT belong: Storing a document's genres or type (api/libraryQueries.ts).
 */
import type { Genre, WorkType } from '@/api/types';

export const GENRES: readonly { id: Genre; label: string }[] = [
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'science-fiction', label: 'Science fiction' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'horror', label: 'Horror' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'historical-fiction', label: 'Historical fiction' },
  { id: 'romance', label: 'Romance' },
  { id: 'literary-fiction', label: 'Literary fiction' },
  { id: 'childrens', label: 'Children’s' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'biography', label: 'Biography' },
  { id: 'memoir', label: 'Memoir' },
  { id: 'history', label: 'History' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'science', label: 'Science' },
  { id: 'technology', label: 'Technology' },
  { id: 'other', label: 'Other' },
];

export const WORK_TYPES: readonly { id: WorkType; label: string }[] = [
  { id: 'novel', label: 'Novel' },
  { id: 'novella', label: 'Novella' },
  { id: 'short-story', label: 'Short story' },
  { id: 'short-story-collection', label: 'Short stories' },
  { id: 'poem', label: 'Poem' },
  { id: 'poetry-collection', label: 'Poetry collection' },
  { id: 'memoir', label: 'Memoir' },
  { id: 'biography', label: 'Biography' },
  { id: 'essay', label: 'Essay' },
  { id: 'research-paper', label: 'Research paper' },
  { id: 'report', label: 'Report' },
  { id: 'personal-document', label: 'Personal document' },
  { id: 'other', label: 'Other' },
];

const TYPE_LABELS = Object.fromEntries(
  WORK_TYPES.map((entry) => [entry.id, entry.label]),
) as Record<WorkType, string>;
const GENRE_LABELS = Object.fromEntries(GENRES.map((entry) => [entry.id, entry.label])) as Record<
  Genre,
  string
>;

export function typeLabel(type: WorkType): string {
  return TYPE_LABELS[type];
}

export function genreLabel(genre: Genre): string {
  return GENRE_LABELS[genre];
}
