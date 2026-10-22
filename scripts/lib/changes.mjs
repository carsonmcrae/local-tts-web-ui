// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Change files: how every pull request declares its release impact and its notes.
 * Scope: Reading `.changes/*.md` (any name except README.md), validating each one (a `bump` of major,
 *   minor, patch or none; New entries need at least a minor bump; `none` may only carry Technical
 *   entries; user-facing entries must be plain language; every surface's impact is declared and
 *   consistent: the Windows app, the browser and phones change together unless one is limited with a
 *   reason, `none` leaves the app alone, anything else reaches a surface, and New features are
 *   documented), and combining pending files into the next version and de-duplicated entries per
 *   section.
 * Does NOT belong: Writing releases (scripts/release/prepare.mjs) or the PR rules (check-changes.mjs).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compareCodeUnits } from './code-unit-order.mjs';
import { SECTIONS, entryKey, parseNotes, technicalWording } from './notes-format.mjs';
import { repoRoot } from './paths.mjs';
import { BUMPS, bumpVersion, compareVersions, strongestBump } from './semver.mjs';

export const CHANGES_DIR = '.changes';
const MAX_ENTRY_LENGTH = 300;

/**
 * The surfaces every change file accounts for (CONTRIBUTING.md, "Cross-surface consistency"): the
 * Windows app, the browser on a computer, a phone's browser over the LAN, the website and the docs.
 */
export const SURFACES = /** @type {const} */ (['desktop', 'browser', 'phone', 'website', 'docs']);
/** These three run the same web app and server, so they change together unless one is limited. */
const APP_SURFACES = /** @type {const} */ (['desktop', 'browser', 'phone']);
/** What each surface may say; `limited` always comes with its reason (`limited: <why>`). */
const VERDICTS = {
  desktop: ['changed', 'unchanged', 'limited'],
  browser: ['changed', 'unchanged', 'limited'],
  phone: ['changed', 'unchanged', 'limited'],
  website: ['changed', 'unchanged', 'pending-release'],
  docs: ['changed', 'unchanged'],
};

/**
 * @typedef {import('./semver.mjs').Bump} Bump
 * @typedef {import('./notes-format.mjs').SectionKey} SectionKey
 * @typedef {typeof SURFACES[number]} Surface
 * @typedef {{ verdict: string, reason: string }} Impact
 * @typedef {{ file: string, bump: Bump, sections: Partial<Record<SectionKey, string[]>>, surfaces: Partial<Record<Surface, Impact>>, problems: string[] }} Change
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
  const surfaces = readSurfaces(doc.fields);
  const problems = [
    ...doc.problems,
    ...(doc.intro ? ['has text before the first "## Section" heading'] : []),
    ...bumpProblems(bump, doc.sections, userEntries.length),
    ...surfaces.problems,
    ...surfaceProblems(surfaces.impacts, bump, doc.sections),
    ...userEntries.flatMap(wordingProblems),
    ...Object.values(doc.sections)
      .flat()
      .filter((entry) => /^(todo|tbd)([ :.]|$)/i.test(entry))
      .map((entry) => `replace the placeholder "${entry.slice(0, 50)}"`),
  ];
  return {
    file,
    bump,
    sections: doc.sections,
    surfaces: surfaces.impacts,
    problems: problems.map((p) => `${file}: ${p}`),
  };
}

/**
 * Each surface's declared impact, and a problem for every surface that is missing or unreadable.
 * @param {Record<string, string>} fields
 */
function readSurfaces(fields) {
  /** @type {Partial<Record<Surface, Impact>>} */
  const impacts = {};
  /** @type {string[]} */
  const problems = [];
  for (const surface of SURFACES) {
    const value = fields[surface] ?? '';
    const limited = /^limited:\s*(\S.*)$/.exec(value);
    const allowed = VERDICTS[surface];
    if (limited && allowed.includes('limited')) {
      impacts[surface] = { verdict: 'limited', reason: limited[1] ?? '' };
    } else if (value !== 'limited' && allowed.includes(value)) {
      impacts[surface] = { verdict: value, reason: '' };
    } else {
      const choices = allowed.map((verdict) =>
        verdict === 'limited' ? 'limited: <why>' : verdict,
      );
      problems.push(
        `needs "${surface}: ${choices.join('|')}" in its front matter (see ${CHANGES_DIR}/README.md, "Surfaces")`,
      );
    }
  }
  return { impacts, problems };
}

/**
 * Whether the declared impacts agree with each other and with the bump.
 * @param {Partial<Record<Surface, Impact>>} impacts
 * @param {Bump} bump
 * @param {Partial<Record<SectionKey, string[]>>} sections
 * @returns {string[]}
 */
function surfaceProblems(impacts, bump, sections) {
  const verdict = (/** @type {Surface} */ surface) => impacts[surface]?.verdict;
  const problems = [];
  const changed = APP_SURFACES.filter((surface) => verdict(surface) === 'changed');
  const unchanged = APP_SURFACES.filter((surface) => verdict(surface) === 'unchanged');
  if (changed.length && unchanged.length) {
    problems.push(
      `says "${changed.join(', ')}: changed" but "${unchanged.join(', ')}: unchanged"; the Windows app, the browser and phones run the same web app, so say "changed", or "limited: <why>" where a surface deliberately differs`,
    );
  }
  const reaches = SURFACES.filter(
    (surface) => verdict(surface) && verdict(surface) !== 'unchanged',
  );
  if (bump === 'none' && APP_SURFACES.some((surface) => reaches.includes(surface))) {
    problems.push('says "bump: none" but changes the app; with "none" nothing users get changes');
  }
  const declared = Object.keys(impacts).length === SURFACES.length;
  if (declared && bump !== 'none' && BUMPS.includes(bump) && !reaches.length) {
    problems.push('changes what users get, but every surface says "unchanged"');
  }
  if (sections.new?.length && verdict('docs') === 'unchanged') {
    problems.push('lists New features; document them and say "docs: changed"');
  }
  return problems;
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

/** The website and the documentation: what a pull request touches when it says they changed. */
const isSite = (/** @type {string} */ file) => file.startsWith('site/');
const isDocs = (/** @type {string} */ file) =>
  file.startsWith('docs/') || /^[A-Z][A-Z-]*\.md$/.test(file);

/**
 * Whether a pull request's change files declare the website and the docs the way its files changed:
 * site/ ↔ "website: changed" (or pending-release), documentation ↔ "docs: changed".
 * @param {Change[]} declared the change files the pull request adds or edits
 * @param {string[]} files every file the pull request changes
 * @returns {string[]}
 */
export function declarationProblems(declared, files) {
  const says = (/** @type {Surface} */ surface, /** @type {string[]} */ verdicts) =>
    declared.some((change) => verdicts.includes(change.surfaces[surface]?.verdict ?? ''));
  const problems = [];
  const website = says('website', ['changed', 'pending-release']);
  const site = files.some(isSite);
  if (site && !website) {
    problems.push(
      'this pull request changes site/, so a change file must say "website: changed" (or "website: pending-release" for content gated on an unreleased version)',
    );
  }
  if (website && !site) {
    problems.push('a change file says the website changed, but nothing under site/ did');
  }
  const docs = says('docs', ['changed']);
  const documented = files.some(isDocs);
  if (documented && !docs) {
    problems.push(
      'this pull request changes documentation, so a change file must say "docs: changed"',
    );
  }
  if (docs && !documented) {
    problems.push(
      'a change file says "docs: changed", but no documentation did (docs/, README.md, CONTRIBUTING.md)',
    );
  }
  return problems;
}

/**
 * Pending change files in a directory (the repository's by default), sorted by name in code-unit
 * order, so every machine and locale lists them the same way.
 * @param {string} [root]
 * @returns {Change[]}
 */
export function readChanges(root = repoRoot) {
  const dir = path.join(root, CHANGES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .toSorted(compareCodeUnits)
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
