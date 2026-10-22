// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Write a release into CHANGELOG.md, the developer-facing history.
 * Scope: Turns the combined change-file sections into a dated `## [X.Y.Z] - YYYY-MM-DD` entry (New →
 *   Added, Improved → Changed, Fixed, Security, Technical), folds in any older `## [Unreleased]` notes
 *   under the same headings, and updates the comparison links at the end of the file; and adds late
 *   change files to an entry that exists but is not tagged yet (`amendRelease`).
 * Does NOT belong: User-facing notes (docs/releases/, written by prepare.mjs and amend.mjs).
 */

const ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security', 'Technical'];

/**
 * Prose before the first `### ` heading, and each heading's text.
 * @param {string} block
 */
function subsections(block) {
  const parts = block.split(/^### (.+)$/m);
  /** @type {Map<string, string>} */
  const map = new Map();
  for (let index = 1; index < parts.length; index += 2) {
    const title = (parts[index] ?? '').trim();
    const body = (parts[index + 1] ?? '').trim();
    map.set(title, [map.get(title), body].filter(Boolean).join('\n'));
  }
  return { intro: (parts[0] ?? '').trim(), map };
}

/**
 * An entry's text: its heading, the prose it already had, then its existing subsections with the new
 * sections' items appended, in the usual order.
 * @param {string} heading e.g. `## [2.1.0] - 2026-10-22`
 * @param {string} existing the entry's current body (nothing for a new entry)
 * @param {{ changelog: string, items: string[] }[]} sections
 */
function renderEntry(heading, existing, sections) {
  const { intro, map } = subsections(existing);
  for (const section of sections) {
    const items = section.items.map((item) => `- ${item}`).join('\n');
    map.set(section.changelog, [map.get(section.changelog), items].filter(Boolean).join('\n'));
  }
  const rank = (/** @type {string} */ title) =>
    ORDER.includes(title) ? ORDER.indexOf(title) : ORDER.length;
  const body = [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([title, items]) => `### ${title}\n\n${items}`);
  return [heading, ...(intro ? [intro] : []), ...body].join('\n\n');
}

/**
 * @param {string} text CHANGELOG.md
 * @param {{ version: string, previous: string, date: string, repo: string,
 *   sections: { changelog: string, items: string[] }[] }} release
 */
export function addRelease(text, { version, previous, date, repo, sections }) {
  const changelog = text.replaceAll('\r\n', '\n');
  const unreleased = /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|^\[)/m.exec(changelog);
  const entry = renderEntry(`## [${version}] - ${date}`, unreleased?.[1] ?? '', sections);
  let result;
  if (unreleased) {
    result = changelog.replace(unreleased[0], `${entry}\n\n`);
  } else {
    const first = changelog.search(/^## \[/m);
    const at = first === -1 ? changelog.length : first;
    result = `${changelog.slice(0, at)}${entry}\n\n${changelog.slice(at)}`;
  }
  const link = `[${version}]: https://github.com/${repo}/compare/v${previous}...v${version}`;
  if (/^\[Unreleased\]: .*$/m.test(result)) return result.replace(/^\[Unreleased\]: .*$/m, link);
  const firstLink = result.search(/^\[\d+\.\d+\.\d+\]: /m);
  return firstLink === -1
    ? `${result.trimEnd()}\n\n${link}\n`
    : `${result.slice(0, firstLink)}${link}\n${result.slice(firstLink)}`;
}

/**
 * Adds change-file sections to the existing `## [version] - date` entry (a release prepared but not
 * tagged yet), under the same headings and in the same order; the heading, its date and every other
 * entry stay as they are.
 * @param {string} text CHANGELOG.md
 * @param {{ version: string, sections: { changelog: string, items: string[] }[] }} amendment
 */
export function amendRelease(text, { version, sections }) {
  const changelog = text.replaceAll('\r\n', '\n');
  const escaped = version.replaceAll('.', String.raw`\.`);
  const entry = new RegExp(
    String.raw`^(## \[${escaped}\] - \d{4}-\d{2}-\d{2})\n([\s\S]*?)(?=^## \[|^\[)`,
    'm',
  ).exec(changelog);
  if (!entry) throw new Error(`CHANGELOG.md has no "## [${version}]" entry to amend`);
  const amended = renderEntry(entry[1] ?? '', entry[2] ?? '', sections);
  return changelog.replace(entry[0], `${amended}\n\n`);
}
