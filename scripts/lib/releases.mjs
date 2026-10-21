// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: User-facing release notes, one reviewed file per published version in docs/releases/.
 * Scope: Reading and validating `docs/releases/X.Y.Z.md` (front matter `version` matching the file
 *   name, a `date`, optionally `published-as` for releases under an earlier name and `revised` after a
 *   correction; a plain-language summary; New / Improved / Fixed / Security & reliability entries; no
 *   unfinished draft marker), sorting them newest first, and rendering one as Markdown for GitHub
 *   Releases and the updater manifest. The app, the website and the release workflow all read these.
 * Does NOT belong: Developer changelog entries (CHANGELOG.md) or pending changes (changes.mjs).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SECTIONS, parseNotes, technicalWording } from './notes-format.mjs';
import { repoRoot } from './paths.mjs';
import { compareVersions, isStable } from './semver.mjs';

export const RELEASES_DIR = 'docs/releases';
export const DRAFT_MARKER = '<!-- draft:';

/**
 * @typedef {{ key: string, title: string, items: string[] }} ReleaseSection
 * @typedef {{
 *   version: string, date: string, publishedAs: string | null, revised: string | null,
 *   summary: string, sections: ReleaseSection[], draft: boolean,
 * }} Release
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} file e.g. docs/releases/2.1.0.md (for messages and the expected version)
 * @param {string} text
 * @returns {{ release: Release, problems: string[] }}
 */
export function parseRelease(file, text) {
  const doc = parseNotes(text);
  const problems = [...doc.problems];
  const expected = path.basename(file, '.md');
  const { version = '', date = '', revised = null } = doc.fields;
  if (version !== expected)
    problems.push(`front matter "version: ${version}" should be ${expected}`);
  if (!isStable(expected)) problems.push('file name must be a stable version (X.Y.Z.md)');
  if (!DATE.test(date)) problems.push('needs "date: YYYY-MM-DD"');
  if (revised !== null && !DATE.test(revised)) problems.push('"revised" must be YYYY-MM-DD');
  if (doc.sections.technical)
    problems.push('has a Technical section; that belongs in CHANGELOG.md');
  const draft = text.includes(DRAFT_MARKER);
  const summary = doc.intro
    .split('\n')
    .filter((line) => !line.includes(DRAFT_MARKER))
    .join('\n')
    .trim();
  if (!summary) problems.push('needs a short plain-language summary before the first section');
  const sections = SECTIONS.filter(
    (section) => section.user && doc.sections[section.key]?.length,
  ).map((section) => ({
    key: section.key,
    title: section.title,
    items: doc.sections[section.key] ?? [],
  }));
  for (const sentence of [summary, ...sections.flatMap((section) => section.items)]) {
    for (const issue of technicalWording(sentence)) problems.push(`uses ${issue}`);
  }
  return {
    release: {
      version: expected,
      date,
      publishedAs: doc.fields['published-as'] ?? null,
      revised,
      summary,
      sections,
      draft,
    },
    problems: problems.map((problem) => `${file}: ${problem}`),
  };
}

/**
 * Every release notes file, newest version first.
 * @param {string} [root]
 * @returns {{ releases: Release[], problems: string[] }}
 */
export function readReleases(root = repoRoot) {
  const dir = path.join(root, RELEASES_DIR);
  if (!existsSync(dir)) return { releases: [], problems: [] };
  const parsed = readdirSync(dir)
    .filter((name) => /^\d+\.\d+\.\d+\.md$/.test(name))
    .map((name) =>
      parseRelease(`${RELEASES_DIR}/${name}`, readFileSync(path.join(dir, name), 'utf8')),
    );
  return {
    releases: parsed
      .map((item) => item.release)
      .sort((a, b) => compareVersions(b.version, a.version)),
    problems: parsed.flatMap((item) => item.problems),
  };
}

/**
 * Markdown for a GitHub Release body or the updater's `notes`.
 * @param {Release} release
 */
export function renderRelease(release) {
  const parts = [release.summary];
  for (const section of release.sections) {
    parts.push(`## ${section.title}\n\n${section.items.map((item) => `- ${item}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * A human date such as "October 19, 2026" (UTC, so it never shifts by time zone).
 * @param {string} date YYYY-MM-DD
 */
export function formatDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * @param {string} version
 * @param {string} date
 * @param {{ title: string, user: boolean, items: string[] }[]} sections
 */
export function draftNotes(version, date, sections) {
  const user = sections.filter((section) => section.user);
  const counts = user.map((section) => `${section.items.length} ${section.title.toLowerCase()}`);
  return [
    `---\nversion: ${version}\ndate: ${date}\n---`,
    `${DRAFT_MARKER} rewrite this summary in two or three plain sentences, check every line below, then delete this line -->`,
    `TTSNative ${version}: ${counts.join(', ') || 'maintenance and reliability work'}.`,
    ...user.map(
      (section) => `## ${section.title}\n\n${section.items.map((item) => `- ${item}`).join('\n')}`,
    ),
  ].join('\n\n');
}
