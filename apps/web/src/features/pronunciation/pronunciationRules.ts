// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The small rules behind the pronunciation screens.
 * Scope: The word or short phrase a reader selected (without the punctuation around it), which saved
 *   pronunciations already cover a word (this document's own and the library's), and how a rule's
 *   scope is described. Pure functions only.
 * Does NOT belong: Matching rules to what is spoken (the server) or components.
 */
import type { Pronunciation } from '@/api/types';

export const MAX_WORD_CHARS = 100;
export const MAX_SAY_AS_CHARS = 200;
const MAX_WORDS = 6;
/** Longer than any word or short phrase with its surrounding spaces and punctuation. */
const MAX_SELECTION_CHARS = 1000;
const EDGES = /^[\s"'“”‘’«»()[\]{},;:!?…–—-]+|[\s"'“”‘’«»()[\]{},;:!?…–—-]+$/g;
// "Dr.", "St.", "Mrs.": a short capitalised word whose full stop belongs to it.
const ABBREVIATION = /(?:^|\s)[A-Z][a-z]{0,3}\.$/;

/** The word or phrase in a selection, or null when there is none or it is too long to be one. */
export function selectedWord(text: string): string | null {
  // Checked first, so the patterns below only ever see a short string, however much is selected.
  if (text.length > MAX_SELECTION_CHARS) return null;
  let word = text.replace(EDGES, '').replace(/\s+/g, ' ');
  // A full stop that ends the sentence isn't part of the word; one that ends an abbreviation is.
  if (word.endsWith('.') && !ABBREVIATION.test(word)) word = word.replace(/\.+$/, '');
  if (!word || word.length > MAX_WORD_CHARS || word.split(' ').length > MAX_WORDS) return null;
  return word;
}

function covers(rule: Pronunciation, word: string): boolean {
  return rule.matchCase ? rule.word === word : rule.word.toLowerCase() === word.toLowerCase();
}

/** The pronunciations saved for ``word``: the document's own (which wins there) and the library's. */
export function rulesFor(rules: readonly Pronunciation[], word: string, documentId: string) {
  const matching = rules.filter((rule) => covers(rule, word.trim()));
  return {
    own: matching.find((rule) => rule.documentId === documentId),
    library: matching.find((rule) => !rule.documentId),
  };
}

export function scopeLabel(rule: Pronunciation): string {
  return rule.documentId ? `Only in “${rule.documentTitle ?? 'one document'}”` : 'All documents';
}
