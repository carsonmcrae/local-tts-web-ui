// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Change files: how every pull request declares its release impact and its notes.
 * Scope: Reading `.changes/*.md` (any name except README.md), validating each one (a `bump` of major,
 *   minor, patch or none; New entries need at least a minor bump; `none` may only carry Technical
 *   entries; user-facing entries must be plain language), and combining pending files into the next
 *   version and de-duplicated entries per section.
 * Does NOT belong: Writing releases (scripts/release/prepare.mjs) or the PR rules (check-changes.mjs).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SECTIONS, entryKey, parseNotes, technicalWording } from './notes-format.mjs';
import { repoRoot } from './paths.mjs';
import { BUMPS, bumpVersion, compareVersions, strongestBump } from './semver.mjs';

export const CHANGES_DIR = '.changes';
const MAX_ENTRY_LENGTH = 300;

/**
 * @typedef {import('./semver.mjs').Bump} Bump
 * @typedef {import('./notes-format.mjs').SectionKey} SectionKey
 * @typedef {{ file: string, bump: Bump, sections: Partial<Record<SectionKey, string[]>>, problems: string[] }} Change
 */

/**
 * @param {string} file repository-relative path, for messages
 * @param {string} text
 * @returns {Change}
 */
export function parseChange(file, text) {
  const doc = parseNotes(text);
  const bump = /** @type {Bump} */ (doc.fields.bump ?? '');
  const userKeys = SECTIONS.filter((section) => section.user).map((section) => section.key);
  const userEntries = userKeys.flatMap((key) => doc.sections[key] ?? []);
  const problems = [
    ...doc.problems,
    ...(doc.intro ? ['has text before the first "## Section" heading'] : []),
    ...bumpProblems(bump, doc.sections, userEntries.length),
    ...userEntries.flatMap(wordingProblems),
    ...Object.values(doc.sections)
      .flat()
      .filter((entry) => /^(todo|tbd)([ :.]|$)/i.test(entry))
      .map((entry) => `replace the placeholder "${entry.slice(0, 50)}"`),
  ];
  return { file, bump, sections: doc.sections, problems: problems.map((p) => `${file}: ${p}`) };
}

/**
 * @param {Bump} bump
 * @param {Partial<Record<SectionKey, string[]>>} sections
 * @param {number} userCount
 * @returns {string[]}
 */
function bumpProblems(bump, sections, userCount) {
  if (!BUMPS.includes(bump)) {
    return [
      `needs "bump: major", "bump: minor", "bump: patch" or "bump: none" in its front matter`,
    ];
  }
  const problems = [];
  if (bump === 'none' && userCount) {
    problems.push('has user-facing entries but "bump: none"; use patch, minor or major');
  }
  if (bump === 'none' && !sections.technical?.length) {
    problems.push('says "bump: none"; describe the change under "## Technical"');
  }
  if (bump !== 'none' && !Object.values(sections).flat().length) problems.push('has no entries');
  if (sections.new?.length && (bump === 'patch' || bump === 'none')) {
    problems.push('lists New features, which need at least "bump: minor"');
  }
  return problems;
}

/** @param {string} entry @returns {string[]} */
function wordingProblems(entry) {
  const problems = technicalWording(entry).map(
    (issue) =>
      `user-facing entry uses ${issue}; say what changes for people, or move it to Technical`,
  );
  if (entry.length > MAX_ENTRY_LENGTH) {
    problems.push(`entry is longer than ${MAX_ENTRY_LENGTH} characters: "${entry.slice(0, 50)}…"`);
  }
  return problems;
}

/**
 * Pending change files in a directory (the repository's by default), sorted by name.
 * @param {string} [root]
 * @returns {Change[]}
 */
export function readChanges(root = repoRoot) {
  const dir = path.join(root, CHANGES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) =>
      parseChange(`${CHANGES_DIR}/${name}`, readFileSync(path.join(dir, name), 'utf8')),
    );
}

/**
 * The version the next release gets from `current` (the last released or prepared version).
 * @param {string} current
 * @param {Change[]} changes
 */
export function nextVersion(current, changes) {
  return bumpVersion(current, strongestBump(changes.map((change) => change.bump)));
}

/**
 * Entries from several change files per section, in section order, without duplicates.
 * @param {Change[]} changes
 * @returns {{ key: SectionKey, title: string, changelog: string, user: boolean, items: string[] }[]}
 */
export function combineSections(changes) {
  const ordered = [...changes].sort(
    (a, b) => BUMPS.indexOf(a.bump) - BUMPS.indexOf(b.bump) || a.file.localeCompare(b.file),
  );
  return SECTIONS.map((section) => {
    const seen = new Set();
    const items = ordered
      .flatMap((change) => change.sections[section.key] ?? [])
      .filter((item) => !seen.has(entryKey(item)) && seen.add(entryKey(item)));
    return { ...section, items };
  }).filter((section) => section.items.length);
}

/**
 * Whether `candidate` is a valid next version after `current` for these changes (never backwards).
 * @param {string} current
 * @param {string} candidate
 * @param {Change[]} changes
 */
export function isExpectedNext(current, candidate, changes) {
  return compareVersions(candidate, current) > 0 && candidate === nextVersion(current, changes);
}
