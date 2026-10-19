// @ts-check
/**
 * Purpose: Build the showcase video's soundtrack: a voice-over spoken by Local TTS itself, over the
 *   synthesized music bed.
 * Scope: Generates each voice-over line through the running app's API (Kokoro voice "Heart"), checks
 *   that it fits its scene window, places it on the timeline, ducks the music under the voice, adds
 *   the effects and normalises the mix to −16 LUFS (two-pass loudnorm). Returns the cue list used for
 *   the captions.
 * Does NOT belong: Picture (promo/promo.js, render-promo.mjs) or synthesis of the music itself
 *   (promo-music.mjs).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { duration, findTool, run } from './ffmpeg.mjs';
import { writeEffects, writeMusic } from './promo-music.mjs';

const VOICE = 'kokoro:af_heart';
/** Voice-over lines; `start` matches each scene in promo/promo.js and `limit` is the scene's end. */
const CUES = [
  { start: 0.6, limit: 5.4, text: 'Any document can become something you listen to.' },
  {
    start: 5.9,
    limit: 12.0,
    text: 'Open a PDF, an e-book, or a Word file, and Local TTS reads it aloud.',
  },
  {
    start: 12.6,
    limit: 19.6,
    text: 'Follow along, sentence by sentence, and pick up right where you left off.',
  },
  {
    start: 20.1,
    limit: 25.6,
    text: 'Choose from fifty-four natural voices, and export to MP3.',
  },
  {
    start: 26.1,
    limit: 32.0,
    text: 'Want your own voice? Record a short sample, give consent, and it reads for you.',
  },
  {
    start: 32.6,
    limit: 38.2,
    text: 'Everything runs on your computer. No accounts, and no cloud.',
  },
  {
    start: 38.9,
    limit: 44.6,
    text: 'Local TTS. Free and open source. And yes, it made this voice-over.',
  },
];
const WHOOSHES = [5.4, 12.0, 19.6, 25.6, 32.0, 38.2];
const CHIME = 38.45;

/**
 * @param {string} base app origin, e.g. http://127.0.0.1:8793
 * @param {string} dir work folder
 * @returns {Promise<{ start: number, end: number, text: string, file: string }[]>}
 */
export async function voiceOver(base, dir) {
  const cues = [];
  for (const [i, cue] of CUES.entries()) {
    const response = await fetch(`${base}/api/voices/${VOICE}/preview`, {
      method: 'POST',
      headers: { 'X-LTTS-Client': 'web', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cue.text }),
    });
    if (!response.ok) throw new Error(`voice-over line ${i + 1}: ${response.status}`);
    const file = path.join(dir, `vo-${i + 1}.wav`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    const length = await duration(file);
    const end = cue.start + length;
    console.log(
      `  line ${i + 1}: ${length.toFixed(2)} s (${cue.start}–${end.toFixed(2)}, scene ends ${cue.limit})`,
    );
    if (end > cue.limit - 0.25)
      throw new Error(`voice-over line ${i + 1} is too long for its scene: "${cue.text}"`);
    cues.push({ start: cue.start, end, text: cue.text, file });
  }
  return cues;
}

/**
 * @param {string} dir
 * @param {{ start: number, file: string }[]} cues
 * @param {number} total seconds
 * @returns {Promise<string>} the mixed WAV
 */
export async function mix(dir, cues, total) {
  const ffmpeg = findTool('ffmpeg');
  const music = path.join(dir, 'music.wav');
  const effects = path.join(dir, 'effects.wav');
  writeMusic(music, total);
  writeEffects(effects, total, WHOOSHES, CHIME);
  const inputs = [...cues.flatMap((c) => ['-i', c.file]), '-i', music, '-i', effects];
  const m = cues.length;
  const voices = cues.map(
    (c, i) =>
      `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.start * 1000)}:all=1[v${i}]`,
  );
  const graph = [
    ...voices,
    `${cues.map((_, i) => `[v${i}]`).join('')}amix=inputs=${m}:normalize=0,apad,atrim=duration=${total}[vo]`,
    '[vo]asplit=2[voice][key]',
    `[${m}:a]volume=0.9,aecho=0.8:0.6:90|180:0.22|0.12[pad]`,
    '[pad][key]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=600[ducked]',
    `[${m + 1}:a]volume=0.55[fx]`,
    '[voice][ducked][fx]amix=inputs=3:normalize=0,atrim=duration=' + total + '[out]',
  ].join(';');
  const raw = path.join(dir, 'soundtrack-raw.wav');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    ...inputs,
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-c:a',
    'pcm_s16le',
    raw,
  ]);
  const analysis = await run(ffmpeg, [
    '-hide_banner',
    '-i',
    raw,
    '-af',
    'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f',
    'null',
    '-',
  ]);
  const m2 = JSON.parse(analysis.slice(analysis.lastIndexOf('{'), analysis.lastIndexOf('}') + 1));
  const out = path.join(dir, 'soundtrack.wav');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', raw, '-af',
    `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m2.input_i}:measured_TP=${m2.input_tp}:measured_LRA=${m2.input_lra}:measured_thresh=${m2.input_thresh}:offset=${m2.target_offset}:linear=true`,
    '-ar', '48000', '-c:a', 'pcm_s16le', out]); // prettier-ignore
  return out;
}
