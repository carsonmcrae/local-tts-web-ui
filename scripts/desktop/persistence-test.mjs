// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove the Windows app keeps everything a person did across a close, a crash and a reopen.
 * Scope: Uploads PDF, Word and EPUB files; saves a reading position and voice, a bookmark with a note, a
 *   pronunciation rule, preferences, an MP3 export and the window's display settings; files a document in
 *   a folder and a collection with its type, genres and tags; opens an included book offline, applies its
 *   reading preset, chooses a character's voice over it, and hides another book. Closes normally, reopens
 *   and compares everything; ends it abruptly (crash or power cut), reopens and compares again. Reads the
 *   window's storage through WebView2's debugging port. Usage: `node scripts/desktop/persistence-test.mjs`
 *   against the installed app (test documents stay), or `--install <installer>` on a disposable machine.
 * Does NOT belong: The installer checks or updating (smoke-test.mjs, update-test.mjs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { repoRoot } from '../lib/paths.mjs';
import { appPage, launchForDebugging } from './webview-debugging.mjs';

const exe = path.join(process.env.LOCALAPPDATA ?? '', 'TTSNative', 'TTSNative.exe');
const DEBUG_PORT = 9334;
const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:/Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
const HEADERS = { 'x-ltts-client': 'persistence-test' };
const STORAGE = {
  'ltts.theme': 'dark',
  'ltts.librarySort': 'title',
  'ltts.readingText': '{"size":"large","spacing":"relaxed","font":"serif"}',
};

/** @param {boolean} condition @param {string} message */
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
}

/** @param {string} script */
const powershell = (script) =>
  execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();
const running = (/** @type {string} */ name) =>
  Number(powershell(`@(Get-Process -Name '${name}' -ErrorAction SilentlyContinue).Count`));

/** @param {string} url @param {RequestInit} [init] @returns {Promise<any>} */
async function api(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
  if (!response.ok)
    throw new Error(`FAILED: ${init.method ?? 'GET'} ${url} answered ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const start = () => launchForDebugging(exe, DEBUG_PORT);

/** @param {string} origin */
async function windowStorage(origin, /** @type {Record<string, string> | null} */ write = null) {
  const page = await appPage(DEBUG_PORT, origin);
  const values = await page.evaluate(
    ([keys, entries]) => {
      if (entries)
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
    },
    /** @type {[string[], Record<string, string> | null]} */ ([Object.keys(STORAGE), write]),
  );
  await page.context().browser()?.close();
  return values;
}

/** Which of an included book's reading preset components are applied. @param {string} origin @param {string} id */
async function presetState(origin, id) {
  const report =
    /** @type {{ appliedAt: string | null, components: { name: string, applied: boolean }[] }} */ (
      await api(`${origin}/api/documents/${id}/preset`)
    );
  return {
    appliedAt: report.appliedAt,
    applied: report.components.filter((c) => c.applied).map((c) => c.name),
  };
}

/** The folder or collection of that name, created the first time (test documents stay between runs). */
async function named(/** @type {string} */ url, /** @type {string} */ name) {
  const existing = /** @type {{ id: string, name: string }[]} */ (await api(url));
  return (
    existing.find((item) => item.name === name) ??
    /** @type {{ id: string }} */ (
      await api(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    )
  );
}

/** Everything a person did, as the app reports it. @param {string} origin */
async function snapshot(origin) {
  const documents =
    /** @type {{ id: string, title: string, progress: unknown, shelf: unknown, bundledWorkId?: string | null }[]} */ (
      await api(`${origin}/api/documents`)
    );
  const details = await Promise.all(
    documents.map(async (doc) => ({
      id: doc.id,
      title: doc.title,
      progress: doc.progress,
      shelf: doc.shelf,
      bundledWorkId: doc.bundledWorkId ?? null,
      bookmarks: await api(`${origin}/api/documents/${doc.id}/bookmarks`),
      characters: await api(`${origin}/api/documents/${doc.id}/characters`),
      preset: doc.bundledWorkId ? await presetState(origin, doc.id) : null,
      soundEffects: await api(`${origin}/api/documents/${doc.id}/sound-effects`),
    })),
  );
  const jobs = /** @type {{ id: string, kind: string, status: string }[]} */ (
    await api(`${origin}/api/jobs`)
  );
  const works = /** @type {{ workId: string, documentId: string | null, hidden: boolean }[]} */ (
    await api(`${origin}/api/library/works`)
  );
  return {
    documents: details.sort((a, b) => a.id.localeCompare(b.id)),
    library: {
      folders: await api(`${origin}/api/library/folders`),
      collections: await api(`${origin}/api/library/collections`),
      tags: await api(`${origin}/api/library/tags`),
      works: works.map(({ workId, documentId, hidden }) => ({ workId, documentId, hidden })),
    },
    pronunciations: await api(`${origin}/api/pronunciations`),
    preferences: await api(`${origin}/api/preferences`),
    exports: jobs
      .filter((job) => job.kind === 'export')
      .map((job) => ({ id: job.id, status: job.status })),
  };
}

async function stop(/** @type {'close' | 'crash'} */ how) {
  if (how === 'close')
    powershell('Get-Process -Name TTSNative | ForEach-Object { [void]$_.CloseMainWindow() }');
  else powershell('Stop-Process -Name TTSNative -Force');
  for (
    let attempt = 0;
    attempt < 60 && (running('TTSNative') || running('ttsnative-backend'));
    attempt += 1
  )
    await sleep(500);
  check(
    !running('TTSNative') && !running('ttsnative-backend'),
    `the app and its server ended (${how})`,
  );
}

async function main() {
  const installIndex = process.argv.indexOf('--install');
  const installer = installIndex >= 0 ? process.argv[installIndex + 1] : undefined;
  if (installer)
    check(spawnSync(installer, ['/S'], { stdio: 'inherit' }).status === 0, 'installed');
  if (running('TTSNative')) await stop('close');
  let origin = await start();
  const fixtures = path.join(repoRoot, 'tests', 'fixtures', 'documents');
  const uploaded = [];
  for (const file of ['sample.pdf', 'sample.docx', 'sample.epub']) {
    const doc = await api(`${origin}/api/documents/upload?filename=${file}`, {
      method: 'POST',
      body: readFileSync(path.join(fixtures, file)),
    });
    uploaded.push(doc);
  }
  check(uploaded.length === 3, 'uploaded a PDF, a Word document and an EPUB');
  const [pdf, docx] = uploaded;
  await api(`${origin}/api/documents/${pdf.id}/progress`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segmentIndex: 2, voiceId: 'kokoro:af_bella' }),
  });
  await api(`${origin}/api/documents/${pdf.id}/bookmarks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segmentIndex: 1, note: 'Remember this part.' }),
  });
  await api(`${origin}/api/documents/${pdf.id}/sound-effects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segmentIndex: 1, soundId: 'door-creak', position: 0, offsetMs: 0 }),
  });
  await api(`${origin}/api/pronunciations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ word: 'Kael', sayAs: 'Kale' }),
  }).catch(() => undefined); // already present after an earlier run
  const preferences = await api(`${origin}/api/preferences`);
  await api(`${origin}/api/preferences`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...preferences, playbackRate: 1.25, exportFormat: 'wav' }),
  });
  // The library's organisation: a folder, a collection, and the PDF's own facets.
  const folder = await named(`${origin}/api/library/folders`, 'Persistence shelf');
  const collection = await named(`${origin}/api/library/collections`, 'Kept across restarts');
  await api(`${origin}/api/documents/${pdf.id}/shelf`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      folderId: folder.id,
      favorite: true,
      documentType: 'report',
      genres: ['history'],
      tags: ['persisted'],
    }),
  });
  await api(`${origin}/api/library/collections/${collection.id}/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ add: [pdf.id, docx.id] }),
  });
  // An included book, opened from the catalog without any network, its preset applied, and the
  // person's own choice of voice for one character over the preset's; another book hidden.
  const carol = await api(`${origin}/api/library/works/a-christmas-carol/open`, { method: 'POST' });
  check(carol.bundledWorkId === 'a-christmas-carol', 'an included book opened from the catalog');
  await api(`${origin}/api/documents/${carol.id}/preset/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ components: ['characters', 'speakers'] }),
  });
  await api(`${origin}/api/documents/${carol.id}/characters`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Scrooge', voiceId: 'kokoro:af_bella' }),
  });
  await api(`${origin}/api/library/works/the-time-machine/hidden`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hidden: true }),
  });
  const job = await api(`${origin}/api/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId: docx.id, voiceId: 'kokoro:af_heart', format: 'mp3' }),
  });
  let status = job.status;
  for (let attempt = 0; attempt < 240 && !['succeeded', 'failed'].includes(status); attempt += 1) {
    await sleep(1000);
    status = (await api(`${origin}/api/jobs/${job.id}`)).status;
  }
  check(status === 'succeeded', 'an MP3 export of the Word document finished');
  const exported = (await (await fetch(`${origin}/api/exports/${job.id}/download`)).arrayBuffer())
    .byteLength;
  await windowStorage(origin, STORAGE);
  const before = await snapshot(origin);

  for (const how of /** @type {const} */ (['close', 'crash'])) {
    await stop(how);
    origin = await start();
    const after = await snapshot(origin);
    check(
      JSON.stringify(after) === JSON.stringify(before),
      `after a ${how}: documents, reading positions, bookmarks and notes, sound effects, pronunciations, preferences and exports are all still there`,
    );
    const again = (await (await fetch(`${origin}/api/exports/${job.id}/download`)).arrayBuffer())
      .byteLength;
    check(again === exported, `after a ${how}: the export still downloads (${again} bytes)`);
    const storage = await windowStorage(origin);
    check(
      JSON.stringify(storage) === JSON.stringify(STORAGE),
      `after a ${how}: theme, reading text and library sort are kept in the window`,
    );
  }
  console.log(
    `(${before.documents.length} documents in the app, ${before.exports.length} exports)`,
  );
  if (installer) {
    await stop('close');
    spawnSync(path.join(path.dirname(exe), 'uninstall.exe'), ['/S'], { stdio: 'inherit' });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
