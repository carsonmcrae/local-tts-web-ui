// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The shared Markdown format of change files (.changes/) and release notes (docs/releases/).
 * Scope: `---` front matter of `key: value` lines, a free-text introduction, `## Section` headings
 *   with `- ` bullet entries (continuation lines are joined), the fixed section list (New, Improved,
 *   Fixed, Security & reliability for users; Technical for the developer changelog only), and the
 *   plain-language check that keeps implementation details out of what users read.
 * Does NOT belong: Rules that only apply to one kind of file (changes.mjs, releases.mjs).
 */

/**
 * @typedef {'new' | 'improved' | 'fixed' | 'security' | 'technical'} SectionKey
 * @typedef {{ key: SectionKey, title: string, changelog: string, user: boolean }} SectionInfo
 */

/** @type {readonly SectionInfo[]} In display order. */
export const SECTIONS = [
  { key: 'new', title: 'New', changelog: 'Added', user: true },
  { key: 'improved', title: 'Improved', changelog: 'Changed', user: true },
  { key: 'fixed', title: 'Fixed', changelog: 'Fixed', user: true },
  { key: 'security', title: 'Security & reliability', changelog: 'Security', user: true },
  { key: 'technical', title: 'Technical', changelog: 'Technical', user: false },
];

const ALIASES = new Map([
  ['new', 'new'],
  ['new features', 'new'],
  ['improved', 'improved'],
  ['improvements', 'improved'],
  ['fixed', 'fixed'],
  ['bug fixes', 'fixed'],
  ['security', 'security'],
  ['security & reliability', 'security'],
  ['security and reliability', 'security'],
  ['technical', 'technical'],
]);

/**
 * @typedef {{
 *   fields: Record<string, string>,
 *   intro: string,
 *   sections: Partial<Record<SectionKey, string[]>>,
 *   problems: string[],
 * }} NotesDocument
 */

/**
 * @param {string} text
 * @returns {NotesDocument}
 */
export function parseNotes(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  /** @type {NotesDocument} */
  const doc = { fields: {}, intro: '', sections: {}, problems: [] };
  let index = 0;
  if (lines[0] === '---') {
    index = 1;
    for (; index < lines.length && lines[index] !== '---'; index += 1) {
      const match = /^([a-z][a-z-]*):\s*(.*)$/.exec(lines[index] ?? '');
      if (match?.[1]) doc.fields[match[1]] = (match[2] ?? '').trim();
      else if (lines[index]?.trim())
        doc.problems.push(`front matter line "${lines[index]}" is not "key: value"`);
    }
    if (index >= lines.length) doc.problems.push('front matter is not closed with `---`');
    index += 1;
  } else {
    doc.problems.push('starts without front matter (a `---` line, `key: value` lines, then `---`)');
  }
  readBody(lines.slice(index), doc);
  return doc;
}

/**
 * The list a `## Heading` collects entries into: its section's (shared when a heading repeats), or a
 * list that is thrown away for an unknown heading, which is reported.
 * @param {string} title
 * @param {NotesDocument} doc
 * @returns {string[]}
 */
function openSection(title, doc) {
  const key = /** @type {SectionKey | undefined} */ (ALIASES.get(title.trim().toLowerCase()));
  if (key) {
    const items = doc.sections[key] ?? [];
    doc.sections[key] = items;
    return items;
  }
  doc.problems.push(`unknown section "${title}" (use ${SECTIONS.map((s) => s.title).join(', ')})`);
  return [];
}

/**
 * @param {string[]} lines
 * @param {NotesDocument} doc
 */
function readBody(lines, doc) {
  /** @type {string[] | null} */
  let items = null;
  /** @type {string[]} */
  const intro = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      items = openSection(heading[1], doc);
    } else if (items === null) {
      intro.push(line);
    } else if (/^[-*]\s+/.test(line)) {
      items.push(line.replace(/^[-*]\s+/, '').trim());
    } else if (line.trim() && !line.trim().startsWith('<!--')) {
      if (items.length && /^\s+/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
      else doc.problems.push(`"${line.trim().slice(0, 60)}" is outside a "- " list entry`);
    }
  }
  doc.intro = intro
    .filter((line) => !line.trim().startsWith('<!--') || line.includes('draft:'))
    .join('\n')
    .trim();
}

/**
 * Developer vocabulary, one alternative of the technical-term pattern each (some with their plural or
 * other endings), matched as whole words in any case. Add a term where it belongs in the list.
 */
const TECHNICAL_TERMS = [
  'api',
  'apis',
  'endpoints?',
  'dependenc(y|ies)',
  String.raw`refactor\w*`,
  'lockfiles?',
  'schemas?',
  'migrations?',
  'commits?',
  'pull requests?',
  'ci',
  'npm',
  'pip',
  'pypi',
  'uv',
  String.raw`node\.?js`,
  'typescript',
  'javascript',
  'react',
  'vite',
  'fastapi',
  'pydantic',
  'tauri',
  'rust',
  'cargo',
  'sqlite',
  'pytest',
  'vitest',
  'playwright',
  'eslint',
  'linter',
  'json',
  'yaml',
  'toml',
  'regex',
  'stack traces?',
  String.raw`onnx\w*`,
  'pytorch',
  'torch',
  'python',
  'workflows?',
  'sdk',
];

/**
 * Words and patterns that belong in the technical changelog, not in notes for users.
 * @type {readonly [RegExp, string][]}
 */
const TECHNICAL = [
  [/`/, 'code formatting'],
  [/\bhttps?:\/\//i, 'a web address'],
  [/(^|\s)#\d+\b/, 'a pull request or issue number'],
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/, 'a commit hash'],
  [/\b(GHSA-|CVE-\d)/i, 'an advisory identifier'],
  [/\b\d+\s+(unit\s+)?tests?\b/i, 'a test count'],
  [new RegExp(String.raw`\b(${TECHNICAL_TERMS.join('|')})\b`, 'i'), 'a technical term'],
];

/**
 * Problems that make a user-facing sentence too technical; empty when it reads as plain language.
 * @param {string} text
 * @returns {string[]}
 */
export function technicalWording(text) {
  return TECHNICAL.flatMap(([pattern, label]) => {
    const match = pattern.exec(text);
    return match ? [`${label} ("${match[0].trim()}")`] : [];
  });
}

/** Normalised form used to drop duplicate entries. @param {string} text */
export function entryKey(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}
