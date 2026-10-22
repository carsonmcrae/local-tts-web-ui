// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the website's Windows download and release history.
 * Scope: Only a published release with an installer whose download answers is advertised; drafts and
 *   pre-releases are ignored; a broken download link fails the build; the download section is filled
 *   in or dropped; the history shows one version with its date, the list of versions and Older /
 *   Newer, escapes the notes and links each GitHub release; every version gets its own page; the
 *   footer names the latest release.
 * Does NOT belong: The rest of the site build (link checks in build-site.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConditions,
  escapeHtml,
  fillDownload,
  fillLatest,
  fillReleasePage,
  githubReleases,
  releasePages,
  releasedFlags,
  dropUnreleased,
  keepUnreleased,
  renderHistory,
} from './releases.mjs';

/** @type {import('../lib/releases.mjs').Release[]} */
const RELEASES = [
  {
    version: '2.0.0',
    date: '2026-10-19',
    publishedAs: 'Local TTS',
    revised: null,
    draft: false,
    summary: 'Fast & <private>.',
    sections: [{ key: 'new', title: 'New', items: ['Read "anything".'] }],
  },
  {
    version: '1.0.0',
    date: '2026-03-24',
    publishedAs: 'Local TTS',
    revised: null,
    draft: false,
    summary: 'The first version.',
    sections: [],
  },
];

const asset = (/** @type {string} */ name, size = 300 * 1_048_576) => ({
  name,
  size,
  browser_download_url: `https://github.com/carsonmcrae/ttsnative/releases/download/x/${name}`,
});

/**
 * @param {unknown[]} releases
 * @param {number} headStatus
 * @returns {typeof fetch}
 */
function fakeFetch(releases, headStatus = 200) {
  return /** @type {typeof fetch} */ (
    async (_url, init) =>
      init?.method === 'HEAD'
        ? new Response(null, { status: headStatus })
        : new Response(JSON.stringify(releases), { status: 200 })
  );
}

test('the latest published release with an installer is advertised', async () => {
  const { published, installer } = await githubReleases(
    fakeFetch([
      {
        tag_name: 'v2.2.0',
        draft: true,
        prerelease: false,
        published_at: '2026-12-01T00:00:00Z',
        assets: [asset('TTSNative-Setup-2.2.0.exe')],
      },
      {
        tag_name: 'v2.2.0-rc.1',
        draft: false,
        prerelease: true,
        published_at: '2026-11-20T00:00:00Z',
        assets: [],
      },
      {
        tag_name: 'v2.1.0',
        draft: false,
        prerelease: false,
        published_at: '2026-11-02T10:00:00Z',
        assets: [asset('TTSNative-Setup-2.1.0.exe'), asset('SHA256SUMS.txt', 900)],
      },
      {
        tag_name: 'v2.0.0',
        draft: false,
        prerelease: false,
        published_at: '2026-10-19T20:29:48Z',
        assets: [],
      },
    ]),
  );
  assert.deepEqual([...published].sort(), ['2.0.0', '2.1.0']);
  assert.deepEqual(installer, {
    version: '2.1.0',
    url: 'https://github.com/carsonmcrae/ttsnative/releases/download/x/TTSNative-Setup-2.1.0.exe',
    size: 300 * 1_048_576,
    date: '2026-11-02',
    checksums: 'https://github.com/carsonmcrae/ttsnative/releases/download/x/SHA256SUMS.txt',
  });
});

test('no installer is advertised before one is published, and a broken link fails the build', async () => {
  const old = [
    {
      tag_name: 'v2.0.0',
      draft: false,
      prerelease: false,
      published_at: '2026-10-19T00:00:00Z',
      assets: [asset('ttsnative-2.0.0-source.tar.gz')],
    },
  ];
  assert.equal((await githubReleases(fakeFetch(old))).installer, null);
  assert.equal((await githubReleases(fakeFetch([]))).installer, null);
  const broken = [{ ...old[0], assets: [asset('TTSNative-Setup-2.0.0.exe')] }];
  await assert.rejects(githubReleases(fakeFetch(broken, 404)), /answers HTTP 404/);
  await assert.rejects(
    githubReleases(/** @type {typeof fetch} */ (async () => new Response('', { status: 403 }))),
    /HTTP 403/,
  );
});

test('the download section is filled in, or replaced by the source install', () => {
  const page =
    '<!-- if:download --><a href="%WIN_URL%">%WIN_VERSION% · %WIN_SIZE% · %WIN_DATE% · %WIN_SUMS%</a><!-- /if:download -->\n<!-- if:no-download --><a href="#install">Install</a><!-- /if:no-download -->\n';
  assert.equal(fillDownload(page, null), '<a href="#install">Install</a>');
  assert.equal(
    fillDownload(page, {
      version: '2.1.0',
      url: 'https://x/a.exe',
      size: 310 * 1_048_576,
      date: '2026-11-02',
      checksums: null,
    }),
    '<a href="https://x/a.exe">2.1.0 · 310 MB · November 2, 2026 · https://github.com/carsonmcrae/ttsnative/releases/latest</a>',
  );
  assert.equal(
    applyConditions('<!-- if:a -->A<!-- /if:a --><!-- if:b -->B<!-- /if:b -->', {
      a: true,
      b: false,
    }),
    'A',
  );
  // A block another pass decides is left alone.
  assert.equal(applyConditions('<!-- if:c -->C<!-- /if:c -->', {}), '<!-- if:c -->C<!-- /if:c -->');
  // A feature card waits for its version to be published; local builds show every known version.
  const cards =
    '<!-- if:released-2.0.0 -->old<!-- /if:released-2.0.0 --><!-- if:released-2.1.0 -->new<!-- /if:released-2.1.0 -->';
  assert.equal(applyConditions(cards, releasedFlags(['2.0.0', '2.1.0'], ['2.0.0'])), 'old');
  assert.equal(
    applyConditions(cards, releasedFlags(['2.0.0', '2.1.0'], ['2.0.0', '2.1.0'])),
    'oldnew',
  );
  assert.deepEqual(releasedFlags(['2.1.0'], []), { 'released-2.1.0': false });
  // A version without notes yet has no flag; its block must still be dropped, and only such blocks.
  const undecided =
    '<!-- if:released-2.2.0 -->later<!-- /if:released-2.2.0 --><!-- if:release -->x<!-- /if:release -->';
  assert.equal(
    dropUnreleased(applyConditions(undecided, releasedFlags(['2.0.0'], ['2.0.0']))),
    '<!-- if:release -->x<!-- /if:release -->',
  );
  assert.equal(dropUnreleased(applyConditions(cards, releasedFlags(['2.0.0'], ['2.0.0']))), 'old');
  assert.equal(
    keepUnreleased(applyConditions(cards, releasedFlags(['2.0.0'], ['2.0.0']))),
    'oldnew',
  );
});

test('the history shows one version with its date, every version listed, and the way around', () => {
  const html = renderHistory(RELEASES);
  assert.match(html, /<h2 id="release-title">Local TTS 2\.0\.0<\/h2>/);
  assert.match(
    html,
    /<time datetime="2026-10-19">October 19, 2026<\/time> · released as Local TTS/,
  );
  assert.match(html, /Fast &amp; &lt;private&gt;\./);
  assert.match(html, /<li>Read &quot;anything&quot;\.<\/li>/);
  assert.match(html, /releases\/tag\/v2\.0\.0/);
  assert.match(
    html,
    /<a href="%BASE_URL%\/releases\/2\.0\.0\/" aria-current="page">Local TTS 2\.0\.0 <small>Latest<\/small><\/a>/,
  );
  assert.match(html, /<a href="%BASE_URL%\/releases\/1\.0\.0\/">Local TTS 1\.0\.0<\/a>/);
  assert.match(html, /rel="prev">.*Older: Local TTS 1\.0\.0<\/a>/);
  assert.match(html, /This is the latest release/);
  const oldest = renderHistory(RELEASES, 1);
  assert.match(oldest, /<h2 id="release-title">Local TTS 1\.0\.0<\/h2>/);
  assert.match(oldest, /No older releases/);
  assert.match(oldest, /rel="next">Newer: Local TTS 2\.0\.0 /);
  assert.doesNotMatch(oldest, /<h3>/);
  assert.match(renderHistory([]), /No release has been published yet/);
  assert.equal(escapeHtml('a<b>&"'), 'a&lt;b&gt;&amp;&quot;');
});

test('every version gets its own page, and the index shows the latest', () => {
  const pages = releasePages(RELEASES);
  assert.deepEqual(
    pages.map((page) => [page.file, page.selected]),
    [
      ['releases.html', 0],
      ['releases/index.html', 0],
      ['releases/2.0.0/index.html', 0],
      ['releases/1.0.0/index.html', 1],
    ],
  );
  assert.equal(pages[1]?.canonical, '%BASE_URL%/releases.html');
  const oldest = pages[3];
  assert.ok(oldest);
  assert.equal(oldest.title, 'Local TTS 1.0.0 · Release history · TTSNative');
  assert.equal(oldest.description, 'What changed in Local TTS 1.0.0, released March 24, 2026.');
  assert.equal(oldest.canonical, '%BASE_URL%/releases/1.0.0/');
  const template =
    '<title>%PAGE_TITLE%</title><meta content="%PAGE_DESCRIPTION%"><link href="%PAGE_URL%"><!-- release-history -->';
  const html = fillReleasePage(template, RELEASES, oldest);
  assert.match(html, /^<title>Local TTS 1\.0\.0 · Release history · TTSNative<\/title>/);
  assert.match(html, /<link href="%BASE_URL%\/releases\/1\.0\.0\/">/);
  assert.match(html, /<h2 id="release-title">Local TTS 1\.0\.0<\/h2>/);
  const first = pages[0];
  assert.ok(first);
  assert.match(fillReleasePage(template, [], first), /No release has been published yet/);
});

test('the footer names the latest release, or nothing before the first one', () => {
  const page =
    'a<!-- if:release --> <a href="%LATEST_PATH%">%LATEST_NAME% (%LATEST_VERSION%, %LATEST_DATE%)</a><!-- /if:release -->b';
  assert.equal(fillLatest(page, null), 'ab');
  assert.equal(
    fillLatest(page, RELEASES[0] ?? null),
    'a <a href="%BASE_URL%/releases/2.0.0/">Local TTS 2.0.0 (2.0.0, October 19, 2026)</a>b',
  );
});
