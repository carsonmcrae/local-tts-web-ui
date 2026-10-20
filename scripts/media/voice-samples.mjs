// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Generate the website's voice samples with the real app: each is spoken by TTSNative itself.
 * Scope: Starts an isolated production server (no user data) with the local Kokoro model, asks the
 *   preview API to speak a short passage in each sample voice, and encodes the clips as small MP3s
 *   in site/audio (the website lists them with their exact text). Fails if a voice is missing.
 *   Usage: `node scripts/media/voice-samples.mjs` (needs the Kokoro model in data/models).
 * Does NOT belong: The website's markup (site/index.html) or the promotional videos.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { withAppServer } from './app-server.mjs';
import { findTool, run } from './ffmpeg.mjs';

const PORT = '8794';
const OUT = path.join(repoRoot, 'site', 'audio');
const WORK = path.join(repoRoot, '.tools', 'media', 'samples');
const ENGLISH =
  'TTSNative reads your documents aloud with natural voices, right on your own computer. Nothing you open ever leaves it.';

/** The sample voices and what each one says (the website shows the same text). */
export const SAMPLES = [
  { voice: 'af_heart', text: ENGLISH },
  { voice: 'af_bella', text: ENGLISH },
  { voice: 'am_michael', text: ENGLISH },
  { voice: 'bf_emma', text: ENGLISH },
  { voice: 'bm_george', text: ENGLISH },
  {
    voice: 'ff_siwis',
    text: 'TTSNative lit vos documents à voix haute avec des voix naturelles, directement sur votre ordinateur.',
  },
  {
    voice: 'ef_dora',
    text: 'TTSNative lee tus documentos en voz alta con voces naturales, directamente en tu propio ordenador.',
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const ffmpeg = findTool('ffmpeg');
  await withAppServer('samples', PORT, async (base) => {
    for (const { voice, text } of SAMPLES) {
      const response = await fetch(`${base}/api/voices/kokoro:${voice}/preview`, {
        method: 'POST',
        headers: { 'X-LTTS-Client': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`${voice}: the app answered ${response.status}`);
      const wav = path.join(WORK, `${voice}.wav`);
      writeFileSync(wav, Buffer.from(await response.arrayBuffer()));
      const mp3 = path.join(OUT, `${voice}.mp3`);
      await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3]);
      console.log(`  ${voice}`);
    }
  });
  console.log(`Voice samples written to ${path.relative(repoRoot, OUT)}`);
}

await main();
