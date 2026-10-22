// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Assemble the TTSNative website for GitHub Pages (and for local preview and tests).
 * Scope: Copies site/, the videos and posters from docs/media and the screenshots from docs/images;
 *   drops sections whose files are missing (`<!-- requires: … -->` … `<!-- /requires -->`); fills in
 *   %BASE_URL% (the address Pages reports, so a custom domain is picked up automatically); adds the
 *   Windows download, the latest version and the release history, one page per version plus the index
 *   (releases.mjs; with `--releases github` only published releases and a verified installer,
 *   otherwise no installer is advertised); writes sitemap.xml and robots.txt; and fails if a local
 *   link (relative or through the base URL) or in-page anchor points nowhere.
 *   Usage: `node scripts/site/build-site.mjs --out _site --base-url https://example.com [--releases github]
 *   [--expect-installer X.Y.Z]` (the last fails the build unless that version's installer is advertised).
 * Does NOT belong: The page content (site/) or deployment (.github/workflows/pages.yml).
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { readReleases } from '../lib/releases.mjs';
import {
  applyConditions,
  fillDownload,
  fillHead,
  fillLatest,
  fillReleasePage,
  githubReleases,
  releasePages,
  releasePath,
  releasedFlags,
  dropUnreleased,
  keepUnreleased,
} from './releases.mjs';

/** @param {string} name */
function option(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

/** Keeps a `requires` block only when every file it names exists in the output. */
export function applyRequirements(/** @type {string} */ html, /** @type {string} */ out) {
  return html.replace(
    /<!-- requires: ([^>]*?) -->([\s\S]*?)<!-- \/requires -->\n?/g,
    (_, files, body) =>
      String(files)
        .split(/\s+/)
        .every((file) => existsSync(path.join(out, file)))
        ? body
        : '',
  );
}

/**
 * Local references (href/src/srcset/poster) and in-page anchors that point nowhere. A reference
 * through the site's own base URL counts as local, so pages in folders can be checked too.
 * @param {string} html
 * @param {string} out
 * @param {string} [base]
 * @param {string} [page] the page's path in the site; a relative link is resolved from its folder
 */
export function brokenLinks(html, out, base = '', page = 'index.html') {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...html.matchAll(/\s(?:href|src|srcset|poster)="([^"]+)"/g)].map((m) =>
    String(m[1]),
  );
  return refs.filter((ref) => {
    const own = base !== '' && ref.startsWith(`${base}/`);
    const local = own ? ref.slice(base.length + 1) : ref;
    // An anchor reached through the base URL is on the home page, not on this one.
    if (local.startsWith('#')) return own ? false : !ids.has(local.slice(1));
    if (/^(https?:|mailto:|data:)/.test(local) || local === './') return false;
    const from = own ? out : path.join(out, path.dirname(page));
    return !existsSync(path.join(from, local.split(/[?#]/)[0] ?? ''));
  });
}

/**
 * After a release, the Pages run is told which installer it must find (`--expect-installer`), so a
 * site that would not advertise the new version fails visibly instead of quietly keeping the old
 * download.
 * @param {import('./releases.mjs').Installer | null} installer
 */
function installerAsExpected(installer) {
  if (!process.argv.includes('--expect-installer')) return true;
  const expected = option('--expect-installer');
  if (installer?.version === expected) return true;
  console.error(
    `expected the Windows installer ${expected} to be published; found ${installer ? installer.version : 'none'}`,
  );
  return false;
}

/**
 * The download page is noindex until an installer exists, so it joins the sitemap only then.
 * @param {{ version: string }[]} releases
 * @param {import('./releases.mjs').Installer | null} installer
 */
function sitemapUrls(releases, installer) {
  return [
    '/',
    '/releases.html',
    ...(installer ? ['/download/'] : []),
    ...releases.map((release) => `/${releasePath(release.version)}`),
  ];
}

/** Published release notes (drafts never) and the installer to advertise, if any. */
async function releaseInfo() {
  const finished = readReleases().releases.filter((release) => !release.draft);
  const known = finished.map((release) => release.version);
  if (!process.argv.includes('--releases') || option('--releases') !== 'github') {
    return { releases: finished, installer: null, known, github: false };
  }
  const { published, installer } = await githubReleases();
  return {
    releases: finished.filter((release) => published.has(release.version)),
    installer,
    known,
    github: true,
  };
}

async function main() {
  const out = path.resolve(option('--out'));
  let base = option('--base-url');
  while (base.endsWith('/')) base = base.slice(0, -1);
  // The base URL comes from the Pages configuration, and goes into HTML and XML unescaped.
  if (!/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(base))
    throw new Error(`--base-url must be a plain http(s) origin, got "${base}"`);
  rmSync(out, { recursive: true, force: true });
  cpSync(path.join(repoRoot, 'site'), out, { recursive: true });
  // The shared head partial is inserted into the pages, never published on its own.
  rmSync(path.join(out, 'partials'), { recursive: true, force: true });

  const media = path.join(repoRoot, 'docs', 'media');
  mkdirSync(path.join(out, 'media'), { recursive: true });
  for (const file of readdirSync(media).filter(
    (f) => /\.(mp4|webp|vtt)$/.test(f) || f === 'social-preview.png',
  )) {
    copyFileSync(path.join(media, file), path.join(out, 'media', file));
  }
  // Only the screenshots the pages use: docs/images also holds ones meant for the README.
  const sources = ['index.html', '404.html'].map((page) =>
    readFileSync(path.join(out, page), 'utf8'),
  );
  const wanted = new Set(
    sources.flatMap((html) => [...html.matchAll(/images\/([\w.-]+)/g)].map((m) => String(m[1]))),
  );
  mkdirSync(path.join(out, 'images'), { recursive: true });
  for (const file of wanted) {
    copyFileSync(path.join(repoRoot, 'docs', 'images', file), path.join(out, 'images', file));
  }

  const { releases, installer, known, github } = await releaseInfo();
  if (!installerAsExpected(installer)) {
    process.exitCode = 1;
    return;
  }
  const latest = releases[0] ?? null;
  const released = releasedFlags(
    known,
    releases.map((release) => release.version),
  );
  // A version that has no notes yet (the next release, before release:prepare) gets no flag at all. The
  // published site drops such blocks (it never shows an unreleased card); a local build keeps them so
  // the layout can be checked.
  const undecided = github ? dropUnreleased : keepUnreleased;
  const shared = readFileSync(path.join(repoRoot, 'site', 'partials', 'head.html'), 'utf8');
  const fill = (/** @type {string} */ html, /** @type {string} */ page) =>
    fillLatest(
      fillDownload(
        undecided(applyConditions(applyRequirements(fillHead(html, shared, page), out), released)),
        installer,
      ),
      latest,
    ).replaceAll('%BASE_URL%', () => base);
  const pages = ['index.html', 'download/index.html', '404.html'].map((page) => ({
    page,
    html: fill(readFileSync(path.join(out, page), 'utf8'), page),
  }));
  const template = readFileSync(path.join(out, 'releases.html'), 'utf8');
  for (const page of releasePages(releases)) {
    pages.push({
      page: page.file,
      html: fill(fillReleasePage(template, releases, page), page.file),
    });
  }
  for (const { page, html } of pages) {
    mkdirSync(path.dirname(path.join(out, page)), { recursive: true });
    writeFileSync(path.join(out, page), html);
  }
  // Every page exists now, so the links between them can be checked.
  const problems = pages
    .filter(({ page }) => page !== '404.html')
    .flatMap(({ page, html }) =>
      brokenLinks(html, out, base, page).map((ref) => `${page}: ${ref}`),
    );
  writeFileSync(
    path.join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls(
      releases,
      installer,
    )
      .map((url) => `  <url><loc>${base}${url}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(
    path.join(out, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`,
  );
  if (problems.length) {
    console.error(`Broken links:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const offered = installer ? `Windows installer ${installer.version}` : 'no Windows installer';
  console.log(
    `Site built in ${path.relative(repoRoot, out) || out} for ${base} (${releases.length} releases, ${offered})`,
  );
}

await main();
