// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the website's Windows download and release history.
 * Scope: Only a published release with an installer whose download answers is advertised; drafts and
 *   pre-releases are ignored; a broken download link fails the build; the download section is filled
 *   in or dropped; the history page escapes the notes and links each GitHub release.
 * Does NOT belong: The rest of the site build (link checks in build-site.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConditions,
  escapeHtml,
  fillDownload,
  githubReleases,
  renderHistory,
} from './releases.mjs';

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
    applyConditions('<!-- if:a -->A<!-- /if:a --><!-- if:b -->B<!-- /if:b -->', { a: true }),
    'A',
  );
});

test('the history page escapes the notes and links each release', () => {
  const html = renderHistory([
    {
      version: '2.0.0',
      date: '2026-10-19',
      publishedAs: 'Local TTS',
      revised: null,
      draft: false,
      summary: 'Fast & <private>.',
      sections: [{ key: 'new', title: 'New', items: ['Read "anything".'] }],
    },
  ]);
  assert.match(html, /<h2 id="v2-0-0-title">Local TTS 2\.0\.0<\/h2>/);
  assert.match(html, /October 19, 2026 · released as Local TTS/);
  assert.match(html, /Fast &amp; &lt;private&gt;\./);
  assert.match(html, /<li>Read &quot;anything&quot;\.<\/li>/);
  assert.match(html, /releases\/tag\/v2\.0\.0/);
  assert.match(renderHistory([]), /No release has been published yet/);
  assert.equal(escapeHtml('a<b>&"'), 'a&lt;b&gt;&amp;&quot;');
});
