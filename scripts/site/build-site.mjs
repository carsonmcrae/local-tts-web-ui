// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Assemble the TTSNative website for GitHub Pages (and for local preview and tests).
 * Scope: Copies site/, the videos and posters from docs/media and the screenshots from docs/images;
 *   drops sections whose files are missing (`<!-- requires: … -->` … `<!-- /requires -->`); fills in
 *   %BASE_URL% (the address Pages reports, so a custom domain is picked up automatically); writes
 *   sitemap.xml and robots.txt; and fails if a local link or in-page anchor points nowhere.
 *   Usage: `node scripts/site/build-site.mjs --out _site --base-url https://example.com`.
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

function main() {
  const out = path.resolve(option('--out'));
  let base = option('--base-url');
  while (base.endsWith('/')) base = base.slice(0, -1);
  // The base URL comes from the Pages configuration, and goes into HTML and XML unescaped.
  if (!/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(base))
    throw new Error(`--base-url must be a plain http(s) origin, got "${base}"`);
  rmSync(out, { recursive: true, force: true });
  cpSync(path.join(repoRoot, 'site'), out, { recursive: true });

  const media = path.join(repoRoot, 'docs', 'media');
  mkdirSync(path.join(out, 'media'), { recursive: true });
  for (const file of readdirSync(media).filter(
    (f) => /\.(mp4|webp|vtt)$/.test(f) || f === 'social-preview.png',
  )) {
    copyFileSync(path.join(media, file), path.join(out, 'media', file));
  }
  // Only the screenshots the pages use: docs/images also holds ones meant for the README.
  const pages = ['index.html', '404.html'].map((page) =>
    readFileSync(path.join(out, page), 'utf8'),
  );
  const wanted = new Set(
    pages.flatMap((html) => [...html.matchAll(/images\/([\w.-]+)/g)].map((m) => String(m[1]))),
  );
  mkdirSync(path.join(out, 'images'), { recursive: true });
  for (const file of wanted) {
    copyFileSync(path.join(repoRoot, 'docs', 'images', file), path.join(out, 'images', file));
  }

  const problems = [];
  for (const page of ['index.html', '404.html']) {
    const file = path.join(out, page);
    const html = applyRequirements(readFileSync(file, 'utf8'), out).replaceAll(
      '%BASE_URL%',
      () => base,
    );
    writeFileSync(file, html);
    if (page === 'index.html')
      problems.push(...brokenLinks(html, out).map((ref) => `${page}: ${ref}`));
  }
  writeFileSync(
    path.join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc></url>\n</urlset>\n`,
  );
  writeFileSync(
    path.join(out, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`,
  );
  if (problems.length) {
    console.error(`Broken links:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Site built in ${path.relative(repoRoot, out) || out} for ${base}`);
}

main();
