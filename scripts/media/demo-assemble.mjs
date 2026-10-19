// @ts-check
/**
 * Purpose: Turn a demo recording (screencast frames + the app's audio log) into the shipped video.
 * Scope: Frames → constant 30 fps H.264; the soundtrack is rebuilt from the exact audio files the app
 *   played, each placed at the moment it started playing (two-pass loudness normalisation to
 *   −16 LUFS); writes the MP4, a WebP poster, WebVTT captions (narrated sentences and on-screen steps)
 *   and a facts file into docs/media.
 * Does NOT belong: Driving the app (record-demo.mjs) or the promo video (render-promo.mjs).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { findTool, run } from './ffmpeg.mjs';

const OUT = path.join(repoRoot, 'docs', 'media');
const NAME = 'local-tts-demo';

/** @typedef {{ id: number, type: string, src: string, t: number, at: number, rate: number, text: string }} MediaEvent */
/** @typedef {{ src: string, start: number, end: number, at: number, rate: number, text: string }} Piece */

/**
 * Pairs each `playing` event with the next pause/end/source change on the same audio element.
 * @param {MediaEvent[]} media @param {number} end @returns {Piece[]}
 */
function toPieces(media, end) {
  /** @type {Map<number, Piece>} */
  const open = new Map();
  /** @type {Piece[]} */
  const pieces = [];
  const close = (/** @type {number} */ id, /** @type {number} */ t) => {
    const piece = open.get(id);
    if (piece && t - piece.start > 0.05) pieces.push({ ...piece, end: t });
    open.delete(id);
  };
  for (const event of [...media].sort((a, b) => a.t - b.t)) {
    close(event.id, event.t);
    if (event.type === 'playing') {
      open.set(event.id, {
        src: event.src,
        start: event.t,
        end,
        at: event.at,
        rate: event.rate,
        text: event.text,
      });
    }
  }
  for (const id of [...open.keys()]) close(id, end);
  return pieces;
}

/** @param {number} s */
function stamp(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const pad = (/** @type {number} */ n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/**
 * @param {Piece[]} pieces @param {{ t: number, text: string | null }[]} captions @param {number} t0
 * @returns {string}
 */
function captionsVtt(pieces, captions, t0) {
  /** @type {{ from: number, to: number, text: string }[]} */
  const cues = [];
  captions.forEach((caption, i) => {
    const next = captions[i + 1];
    if (caption.text && next)
      cues.push({ from: caption.t - t0, to: next.t - t0, text: `[On screen: ${caption.text}]` });
  });
  for (const piece of pieces) {
    cues.push({
      from: piece.start - t0,
      to: piece.end - t0,
      text: piece.text || '[A voice reads the sample passage]',
    });
  }
  cues.sort((a, b) => a.from - b.from);
  return (
    'WEBVTT\n\n' + cues.map((c) => `${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join('\n')
  );
}

/**
 * Writes each distinct clip (downloaded by the recorder while it played) to the work folder.
 * @param {Piece[]} pieces @param {Map<string, Promise<Buffer>>} clips @param {string} dir
 */
async function writeSources(pieces, clips, dir) {
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const src of new Set(pieces.map((p) => p.src))) {
    const clip = clips.get(src);
    if (!clip) throw new Error(`no audio was captured for ${src}`);
    const file = path.join(dir, `clip-${files.size}.audio`);
    writeFileSync(file, await clip);
    files.set(src, file);
  }
  return files;
}

/**
 * @param {string} ffmpeg @param {Piece[]} pieces @param {Map<string, string>} files
 * @param {number} t0 @param {number} total @param {string} out
 */
async function soundtrack(ffmpeg, pieces, files, t0, total, out) {
  const inputs = pieces.flatMap((p) => ['-i', /** @type {string} */ (files.get(p.src))]);
  const chains = pieces.map((p, i) => {
    const delay = Math.round((p.start - t0) * 1000);
    const length = (p.end - p.start) * p.rate;
    const tempo = Math.abs(p.rate - 1) > 0.01 ? `,atempo=${p.rate.toFixed(3)}` : '';
    return `[${i}:a]atrim=start=${p.at.toFixed(3)}:duration=${length.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo${tempo},adelay=${delay}:all=1[a${i}]`;
  });
  const mix = `${pieces.map((_, i) => `[a${i}]`).join('')}amix=inputs=${pieces.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${total.toFixed(3)}`;
  const raw = out.replace(/\.wav$/, '-raw.wav');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    ...inputs,
    '-filter_complex',
    `${chains.join(';')};${mix}[out]`,
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
  const measured = JSON.parse(
    analysis.slice(analysis.lastIndexOf('{'), analysis.lastIndexOf('}') + 1),
  );
  const second = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    raw,
    '-af',
    second,
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    out,
  ]);
}

/**
 * @param {{ work: string, frames: { file: string, t: number }[], media: MediaEvent[],
 *   captions: { t: number, text: string | null }[], end: number, clips: Map<string, Promise<Buffer>> }} recording
 */
export async function assemble({ work, frames, media, captions, end, clips }) {
  const ffmpeg = findTool('ffmpeg');
  mkdirSync(OUT, { recursive: true });
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) throw new Error('no frames were captured');
  const t0 = first.t;
  const total = end - t0;
  const list = frames.flatMap((frame, i) => {
    const next = frames[i + 1]?.t ?? end;
    return [
      `file '${frame.file.replaceAll('\\', '/')}'`,
      `duration ${Math.max(next - frame.t, 0.001).toFixed(4)}`,
    ];
  });
  list.push(`file '${last.file.replaceAll('\\', '/')}'`);
  writeFileSync(path.join(work, 'frames.txt'), list.join('\n'));
  const master = path.join(work, 'master-silent.mp4');
  await run(ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'frames.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', master]); // prettier-ignore

  const pieces = toPieces(media, end);
  const files = await writeSources(pieces, clips, work);
  const audio = path.join(work, 'soundtrack.wav');
  await soundtrack(ffmpeg, pieces, files, t0, total, audio);

  const video = path.join(OUT, `${NAME}.mp4`);
  await run(ffmpeg, ['-y', '-v', 'error', '-i', master, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264',
    '-preset', 'veryslow', '-crf', '26', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', '60',
    '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-shortest', '-movflags', '+faststart', video]); // prettier-ignore
  const play = captions.find((c) => c.text?.startsWith('Press Play'));
  const posterAt = play ? play.t - t0 + 7 : 10;
  await run(ffmpeg, ['-y', '-v', 'error', '-ss', posterAt.toFixed(2), '-i', master, '-frames:v', '1', '-c:v', 'libwebp',
    '-quality', '82', path.join(OUT, `${NAME}-poster.webp`)]); // prettier-ignore
  writeFileSync(path.join(OUT, `${NAME}-captions.vtt`), captionsVtt(pieces, captions, t0));
  console.log(`wrote ${video} (${total.toFixed(1)} s, ${pieces.length} audio clips)`);
}
