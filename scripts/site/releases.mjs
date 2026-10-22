// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The website's Windows download, latest-version link and release history, from published
 *   releases only.
 * Scope: Asks GitHub which releases are published and whether the latest one has a Windows installer
 *   (and that its download link really answers); fills the download section with that version, size
 *   and date and the footer with the latest release, keeping or dropping `<!-- if:… -->` blocks
 *   accordingly; and renders the release history from docs/releases/ as one page per version
 *   (releases/<version>/) plus the index (releases.html): the list of versions, the selected version's
 *   notes with its date, and Older / Newer links, all escaped HTML. Without network access (local
 *   builds) no installer is advertised.
 * Does NOT belong: The rest of the site build (build-site.mjs) or the notes' format (lib/releases.mjs).
 */
import { formatDate } from '../lib/releases.mjs';

const REPO = 'carsonmcrae/ttsnative';
const INSTALLER = /^TTSNative-Setup-(\d+\.\d+\.\d+)\.exe$/;
/** The marker in site/releases.html, with the indentation before it. */
const HISTORY_MARKER = / *<!-- release-history -->/;

/**
 * @typedef {{ version: string, url: string, size: number, date: string, checksums: string | null }} Installer
 * @typedef {import('../lib/releases.mjs').Release} Release
 * @typedef {{ file: string, selected: number, title: string, description: string, canonical: string }} ReleasePage
 */

/** @param {string} text */
export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Keep `<!-- if:name -->…<!-- /if:name -->` blocks whose flag is true, drop those whose flag is false
 * (with the indentation before them), and leave the blocks these flags don't decide for a later pass.
 * @param {string} html
 * @param {Record<string, boolean>} flags
 */
export function applyConditions(html, flags) {
  return html.replace(
    / *<!-- if:([a-z0-9.-]+) -->([\s\S]*?)<!-- \/if:\1 -->\n?/g,
    (whole, name, body) => (name in flags ? (flags[name] ? body : '') : whole),
  );
}

/**
 * Flags for `<!-- if:released-X.Y.Z -->` blocks: a feature card for a version goes on the site only once
 * that version is published, so the site never advertises what the released app lacks. `known` are
 * every version with notes in docs/releases; `released` those published (all of them in a local build).
 * @param {string[]} known
 * @param {string[]} released
 */
export function releasedFlags(known, released) {
  return Object.fromEntries(
    known.map((version) => [`released-${version}`, released.includes(version)]),
  );
}

/**
 * Drops every `<!-- if:released-X.Y.Z -->` block that is still undecided: a version with no notes yet
 * (the next release, before `release:prepare`) is by definition not released, so its blocks must go
 * rather than stay for "a later pass". Run after `applyConditions` with `releasedFlags`.
 * @param {string} html
 */
export function dropUnreleased(html) {
  return html.replace(/ *<!-- if:(released-[0-9.]+) -->[\s\S]*?<!-- \/if:\1 -->\n?/g, '');
}

/**
 * The opposite, for local builds: keeps the undecided blocks (markers removed) so a card for the
 * next version can be checked for layout before its notes exist.
 * @param {string} html
 */
export function keepUnreleased(html) {
  return html.replace(/<!-- if:(released-[0-9.]+) -->([\s\S]*?)<!-- \/if:\1 -->/g, '$2');
}

const HEAD_MARK = '<!-- head:shared -->';

/**
 * The partial without the header comment it opens with (its Purpose and Scope, like every file here).
 * Only that first comment is cut, by position, so the rest of the partial goes in exactly as written.
 * @param {string} shared
 */
function partialBody(shared) {
  const text = shared.trimStart();
  if (!text.startsWith('<!--')) return text;
  const end = text.indexOf('-->');
  if (end === -1) throw new Error('site/partials/head.html: the header comment is never closed.');
  return text.slice(end + '-->'.length);
}

/**
 * Puts the head every page shares (site/partials/head.html: social image, card type, theme colours,
 * icons, stylesheets) where a page says `<!-- head:shared -->`, indented like the mark, with `%ROOT%`
 * pointing at the site root from that page's folder so a local build opens from disk at any depth.
 * A page without the mark (404.html) is left alone.
 * @param {string} html
 * @param {string} shared the partial
 * @param {string} page the page's path in the site, e.g. releases/2.0.0/index.html
 */
export function fillHead(html, shared, page) {
  const at = html.indexOf(HEAD_MARK);
  if (at === -1) return html;
  const indent = /[ \t]*$/.exec(html.slice(0, at))?.[0] ?? '';
  const root = '../'.repeat(page.split('/').length - 1);
  const lines = partialBody(shared)
    .trim()
    .split('\n')
    .map((line) => line.replaceAll('%ROOT%', root));
  return html.replace(HEAD_MARK, lines.join(`\n${indent}`));
}

/**
 * @param {string} html
 * @param {Installer | null} installer
 */
export function fillDownload(html, installer) {
  const kept = applyConditions(html, { download: Boolean(installer), 'no-download': !installer });
  if (!installer) return kept;
  return kept
    .replaceAll('%WIN_VERSION%', escapeHtml(installer.version))
    .replaceAll('%WIN_URL%', escapeHtml(installer.url))
    .replaceAll('%WIN_SIZE%', `${Math.round(installer.size / 1_048_576)} MB`)
    .replaceAll('%WIN_DATE%', escapeHtml(formatDate(installer.date)))
    .replaceAll(
      '%WIN_SUMS%',
      escapeHtml(installer.checksums ?? `https://github.com/${REPO}/releases/latest`),
    );
}

/**
 * "TTSNative 2.1.0", or the name a version was released under ("Local TTS 2.0.0").
 * @param {Release} release
 */
function releaseName(release) {
  return `${release.publishedAs ?? 'TTSNative'} ${release.version}`;
}

/**
 * A version's own page, relative to the site root (a folder, so the address needs no file name).
 * @param {string} version
 */
export function releasePath(version) {
  return `releases/${version}/`;
}

/** @param {Release} release */
const pageUrl = (release) => `%BASE_URL%/${releasePath(release.version)}`;

/**
 * The footer's link to the latest release, or nothing before the first one.
 * @param {string} html
 * @param {Release | null} latest
 */
export function fillLatest(html, latest) {
  const kept = applyConditions(html, { release: latest !== null });
  if (!latest) return kept;
  return kept
    .replaceAll('%LATEST_VERSION%', () => escapeHtml(latest.version))
    .replaceAll('%LATEST_NAME%', () => escapeHtml(releaseName(latest)))
    .replaceAll('%LATEST_DATE%', () => escapeHtml(formatDate(latest.date)))
    .replaceAll('%LATEST_PATH%', () => pageUrl(latest));
}

/**
 * The list of every version, the selected one marked as the current page.
 * @param {Release[]} releases newest first
 * @param {number} selected
 */
function renderIndex(releases, selected) {
  const items = releases.map((release, index) => {
    const current = index === selected ? ' aria-current="page"' : '';
    const latest = index === 0 ? ' <small>Latest</small>' : '';
    return `          <li><a href="${pageUrl(release)}"${current}>${escapeHtml(releaseName(release))}${latest}</a></li>`;
  });
  return `      <nav class="release-index" aria-label="Versions">
        <h2>Versions</h2>
        <ol>
${items.join('\n')}
        </ol>
      </nav>`;
}

/**
 * The way to the versions around the selected one, or why there is none.
 * @param {Release | undefined} older
 * @param {Release | undefined} newer
 */
function renderPager(older, newer) {
  const back = older
    ? `<a href="${pageUrl(older)}" rel="prev"><span aria-hidden="true">←</span> Older: ${escapeHtml(releaseName(older))}</a>`
    : '<span>No older releases</span>';
  const forward = newer
    ? `<a href="${pageUrl(newer)}" rel="next">Newer: ${escapeHtml(releaseName(newer))} <span aria-hidden="true">→</span></a>`
    : '<span>This is the latest release</span>';
  return `        <nav class="release-pager" aria-label="Browse releases">
          ${back}
          ${forward}
        </nav>`;
}

/**
 * One version's notes with its date, and the way to the versions around it.
 * @param {Release} release
 * @param {Release | undefined} older
 * @param {Release | undefined} newer
 */
function renderSelected(release, older, newer) {
  const sections = release.sections
    .map(
      (section) =>
        `        <h3>${escapeHtml(section.title)}</h3>\n        <ul>\n${section.items
          .map((item) => `          <li>${escapeHtml(item)}</li>`)
          .join('\n')}\n        </ul>`,
    )
    .join('\n');
  const as = release.publishedAs ? ` · released as ${escapeHtml(release.publishedAs)}` : '';
  return `      <article class="release" aria-labelledby="release-title">
        <p class="fine"><time datetime="${release.date}">${formatDate(release.date)}</time>${as}</p>
        <h2 id="release-title">${escapeHtml(releaseName(release))}</h2>
        <p>${escapeHtml(release.summary)}</p>
${sections}
        <p><a href="https://github.com/${REPO}/releases/tag/v${release.version}">Release page and downloads on GitHub</a></p>
${renderPager(older, newer)}
      </article>`;
}

/**
 * The release history for one page: every version listed, the selected version's notes, and Older /
 * Newer.
 * @param {Release[]} releases newest first
 * @param {number} [selected] index into `releases`
 */
export function renderHistory(releases, selected = 0) {
  const release = releases[selected];
  if (!release) return '    <p>No release has been published yet.</p>';
  return `    <div class="release-layout">
${renderIndex(releases, selected)}
${renderSelected(release, releases[selected + 1], releases[selected - 1])}
    </div>`;
}

/**
 * Every page of the release history: the index (the latest release; also at releases/ so a shortened
 * address still works) and one page per version.
 * @param {Release[]} releases newest first
 * @returns {ReleasePage[]}
 */
export function releasePages(releases) {
  const index = {
    selected: 0,
    title: 'Release history · TTSNative',
    description:
      "What's new in each version of TTSNative, the free, private text-to-speech reader.",
    canonical: '%BASE_URL%/releases.html',
  };
  return [
    { file: 'releases.html', ...index },
    { file: 'releases/index.html', ...index },
    ...releases.map((release, selected) => ({
      file: `${releasePath(release.version)}index.html`,
      selected,
      title: `${releaseName(release)} · Release history · TTSNative`,
      description: `What changed in ${releaseName(release)}, released ${formatDate(release.date)}.`,
      canonical: pageUrl(release),
    })),
  ];
}

/**
 * The release history shell (site/releases.html) filled in for one page.
 * @param {string} template
 * @param {Release[]} releases newest first
 * @param {ReleasePage} page
 */
export function fillReleasePage(template, releases, page) {
  return template
    .replaceAll('%PAGE_TITLE%', () => escapeHtml(page.title))
    .replaceAll('%PAGE_DESCRIPTION%', () => escapeHtml(page.description))
    .replaceAll('%PAGE_URL%', () => page.canonical)
    .replace(HISTORY_MARKER, () => renderHistory(releases, page.selected));
}

/**
 * Published releases and the latest Windows installer, from the GitHub API.
 * @param {typeof fetch} [request]
 * @returns {Promise<{ published: Set<string>, installer: Installer | null }>}
 */
export async function githubReleases(request = fetch) {
  const headers = {
    accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  const response = await request(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers,
  });
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`);
  const releases =
    /** @type {{ tag_name: string, draft: boolean, prerelease: boolean, published_at: string, assets: { name: string, size: number, browser_download_url: string }[] }[]} */ (
      await response.json()
    );
  const published = releases.filter((release) => !release.draft && !release.prerelease);
  const latest = [...published].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  const asset = latest?.assets.find((item) => INSTALLER.test(item.name));
  let installer = null;
  if (latest && asset) {
    const check = await request(asset.browser_download_url, { method: 'HEAD', redirect: 'follow' });
    if (!check.ok)
      throw new Error(`${asset.name} is listed but its download answers HTTP ${check.status}`);
    installer = {
      version: INSTALLER.exec(asset.name)?.[1] ?? '',
      url: asset.browser_download_url,
      size: asset.size,
      date: latest.published_at.slice(0, 10),
      checksums:
        latest.assets.find((item) => item.name === 'SHA256SUMS.txt')?.browser_download_url ?? null,
    };
  }
  return {
    published: new Set(published.map((release) => release.tag_name.replace(/^v/, ''))),
    installer,
  };
}
