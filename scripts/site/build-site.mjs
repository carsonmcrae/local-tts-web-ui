// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Assemble the TTSNative website for GitHub Pages (and for local preview and tests).
 * Scope: Copies site/, the videos and posters from docs/media and the screenshots from docs/images;
 *   drops sections whose files are missing (`<!-- requires: … -->` … `<!-- /requires -->`); fills in
 *   %BASE_URL% (the address Pages reports, so a custom domain is picked up automatically); adds the
 *   Windows download and the release history (releases.mjs; with `--releases github` only published
 *   releases and a verified installer, otherwise no installer is advertised); writes sitemap.xml and
 *   robots.txt; and fails if a local link or in-page anchor points nowhere.
 *   Usage: `node scripts/site/build-site.mjs --out _site --base-url https://example.com [--releases github]`.
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
import { fillDownload, githubReleases, renderHistory } from './releases.mjs';

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

/** Local references (href/src/srcset/poster) and in-page anchors that point nowhere. */
export function brokenLinks(/** @type {string} */ html, /** @type {string} */ out) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...html.matchAll(/\s(?:href|src|srcset|poster)="([^"]+)"/g)].map((m) =>
    String(m[1]),
  );
  return refs.filter((ref) => {
    if (/^(https?:|mailto:|data:)/.test(ref) || ref === './') return false;
    if (ref.startsWith('#')) return !ids.has(ref.slice(1));
    return !existsSync(path.join(out, ref.split(/[?#]/)[0] ?? ''));
  });
}

/** Published release notes (drafts never) and the installer to advertise, if any. */
async function releaseInfo() {
  const finished = readReleases().releases.filter((release) => !release.draft);
  if (!process.argv.includes('--releases') || option('--releases') !== 'github') {
    return { releases: finished, installer: null };
  }
  const { published, installer } = await githubReleases();
  return { releases: finished.filter((release) => published.has(release.version)), installer };
}

async function main() {
  const out = path.resolve(option('--out'));
  let base = option('--base-url');
  while (base.endsWith('/')) base = base.slice(0, -1);
  rmSync(out, { recursive: true, force: true });
  cpSync(path.join(repoRoot, 'site'), out, { recursive: true });

  const media = path.join(repoRoot, 'docs', 'media');
  mkdirSync(path.join(out, 'media'), { recursive: true });
  for (const file of readdirSync(media).filter(
    (f) => /\.(mp4|webp|vtt)$/.test(f) || f === 'social-preview.png',
  )) {
    copyFileSync(path.join(media, file), path.join(out, 'media', file));
  }
  cpSync(path.join(repoRoot, 'docs', 'images'), path.join(out, 'images'), { recursive: true });

  const { releases, installer } = await releaseInfo();
  const problems = [];
  for (const page of ['index.html', 'releases.html', 'download/index.html', '404.html']) {
    const file = path.join(out, page);
    const html = fillDownload(applyRequirements(readFileSync(file, 'utf8'), out), installer)
      .replace('<!-- release-history -->', renderHistory(releases))
      .replaceAll('%BASE_URL%', base);
    writeFileSync(file, html);
    if (page !== '404.html')
      problems.push(...brokenLinks(html, out).map((ref) => `${page}: ${ref}`));
  }
  writeFileSync(
    path.join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc></url>\n  <url><loc>${base}/releases.html</loc></url>
  <url><loc>${base}/download/</loc></url>\n</urlset>\n`,
  );
  writeFileSync(
    path.join(out, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`,
  );
  if (problems.length) {
    console.error(`Broken links:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `Site built in ${path.relative(repoRoot, out) || out} for ${base} (${releases.length} releases, ${installer ? `Windows installer ${installer.version}` : 'no Windows installer'})`,
  );
}

await main();
