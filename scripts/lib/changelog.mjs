// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Write a release into CHANGELOG.md, the developer-facing history.
 * Scope: Turns the combined change-file sections into a dated `## [X.Y.Z] - YYYY-MM-DD` entry (New →
 *   Added, Improved → Changed, Fixed, Security, Technical), folds in any older `## [Unreleased]` notes
 *   under the same headings, and updates the comparison links at the end of the file.
 * Does NOT belong: User-facing notes (docs/releases/, written by prepare.mjs).
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
 * @param {string} text CHANGELOG.md
 * @param {{ version: string, previous: string, date: string, repo: string,
 *   sections: { changelog: string, items: string[] }[] }} release
 */
export function addRelease(text, { version, previous, date, repo, sections }) {
  const changelog = text.replaceAll('\r\n', '\n');
  const unreleased = /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|^\[)/m.exec(changelog);
  const { intro, map } = subsections(unreleased?.[1] ?? '');
  for (const section of sections) {
    const items = section.items.map((item) => `- ${item}`).join('\n');
    map.set(section.changelog, [map.get(section.changelog), items].filter(Boolean).join('\n'));
  }
  const rank = (/** @type {string} */ title) =>
    ORDER.includes(title) ? ORDER.indexOf(title) : ORDER.length;
  const body = [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([title, items]) => `### ${title}\n\n${items}`);
  const entry = [`## [${version}] - ${date}`, ...(intro ? [intro] : []), ...body].join('\n\n');
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
