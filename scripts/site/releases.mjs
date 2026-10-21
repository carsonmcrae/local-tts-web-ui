// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The website's Windows download and release history, from published releases only.
 * Scope: Asks GitHub which releases are published and whether the latest one has a Windows installer
 *   (and that its download link really answers), fills the download section with that version, size
 *   and date, keeps or drops `<!-- if:download -->` / `<!-- if:no-download -->` blocks accordingly, and
 *   renders the release history page from docs/releases/ (escaped HTML, newest first). Without
 *   network access (local builds) no installer is advertised.
 * Does NOT belong: The rest of the site build (build-site.mjs) or the notes' format (lib/releases.mjs).
 */
import { formatDate } from '../lib/releases.mjs';

const REPO = 'carsonmcrae/ttsnative';
const INSTALLER = /^TTSNative-Setup-(\d+\.\d+\.\d+)\.exe$/;

/**
 * @typedef {{ version: string, url: string, size: number, date: string, checksums: string | null }} Installer
 * @typedef {import('../lib/releases.mjs').Release} Release
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
 * Keep `<!-- if:name -->…<!-- /if:name -->` blocks whose flag is true; drop the others.
 * @param {string} html
 * @param {Record<string, boolean>} flags
 */
export function applyConditions(html, flags) {
  return html.replace(/<!-- if:([a-z-]+) -->([\s\S]*?)<!-- \/if:\1 -->\n?/g, (_, name, body) =>
    flags[name] ? body : '',
  );
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

/** @param {Release} release */
function renderOne(release) {
  const id = `v${release.version.replaceAll('.', '-')}`;
  const name = `${escapeHtml(release.publishedAs ?? 'TTSNative')} ${release.version}`;
  const sections = release.sections
    .map(
      (section) =>
        `      <h3>${escapeHtml(section.title)}</h3>\n      <ul>\n${section.items
          .map((item) => `        <li>${escapeHtml(item)}</li>`)
          .join('\n')}\n      </ul>`,
    )
    .join('\n');
  return `    <article id="${id}" class="release" aria-labelledby="${id}-title">
      <h2 id="${id}-title">${name}</h2>
      <p class="fine">${formatDate(release.date)}${release.publishedAs ? ` · released as ${escapeHtml(release.publishedAs)}` : ''}</p>
      <p>${escapeHtml(release.summary)}</p>
${sections}
      <p><a href="https://github.com/${REPO}/releases/tag/v${release.version}">Release page and downloads on GitHub</a></p>
    </article>`;
}

/** @param {Release[]} releases newest first */
export function renderHistory(releases) {
  return releases.length
    ? releases.map(renderOne).join('\n')
    : '    <p>No release has been published yet.</p>';
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
