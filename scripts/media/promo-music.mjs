// @ts-check
/**
 * Purpose: Synthesize the showcase video's music bed and sound effects from scratch.
 * Scope: Deterministic DSP in plain JavaScript (sine/triangle oscillators, envelopes, a seeded noise
 *   generator and one-pole filters) writing 48 kHz stereo WAV files: a soft chord pad with bass and
 *   arpeggios, plus transition whooshes and an end chime. No samples, loops or third-party audio, so
 *   there is nothing to license.
 * Does NOT belong: Voice-over or mixing (promo-audio.mjs).
 */
import { writeFileSync } from 'node:fs';

const RATE = 48_000;
const midi = (/** @type {number} */ note) => 440 * 2 ** ((note - 69) / 12);
const TAU = Math.PI * 2;

/** @param {string} file @param {Float32Array} left @param {Float32Array} right */
function writeWav(file, left, right) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i] ?? 0));
    const r = Math.max(-1, Math.min(1, right[i] ?? 0));
    buffer.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  writeFileSync(file, buffer);
}

/**
 * Adds one oscillator note into the buffers.
 * @param {{ left: Float32Array, right: Float32Array }} out
 * @param {{ freq: number, start: number, length: number, gain: number, pan: number,
 *   attack: number, release: number, decay?: number, shape?: 'sine' | 'soft' }} note
 */
function addNote(
  out,
  { freq, start, length, gain, pan, attack, release, decay = 0, shape = 'sine' },
) {
  const from = Math.max(0, Math.floor(start * RATE));
  const to = Math.min(out.left.length, Math.floor((start + length + release) * RATE));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = from; i < to; i += 1) {
    const t = i / RATE - start;
    const env =
      Math.min(1, t / attack) *
      (t > length ? Math.max(0, 1 - (t - length) / release) : 1) *
      (decay > 0 ? Math.exp(-t / decay) : 1);
    const phase = TAU * freq * t;
    const wave =
      shape === 'soft'
        ? Math.sin(phase) + 0.18 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase)
        : Math.sin(phase);
    const value = wave * env;
    out.left[i] = (out.left[i] ?? 0) + value * gl;
    out.right[i] = (out.right[i] ?? 0) + value * gr;
  }
}

// A gentle progression in C major, two bars (≈5.7 s at 84 BPM) per chord.
const BEAT = 60 / 84;
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 71] }, // Cmaj7
  { root: 45, tones: [57, 60, 64, 67] }, // Am7
  { root: 41, tones: [57, 60, 64, 65] }, // Fmaj7
  { root: 43, tones: [55, 59, 62, 69] }, // G(add9)
];

/** @param {string} file @param {number} duration seconds */
export function writeMusic(file, duration) {
  const frames = Math.ceil(duration * RATE);
  const out = { left: new Float32Array(frames), right: new Float32Array(frames) };
  const span = BEAT * 8;
  for (let c = 0; c * span < duration; c += 1) {
    const chord = CHORDS[c % CHORDS.length] ?? CHORDS[0];
    if (!chord) continue;
    const start = c * span;
    chord.tones.forEach((note, i) => {
      for (const cents of [-4, 4]) {
        addNote(out, {
          freq: midi(note) * 2 ** (cents / 1200),
          start,
          length: span,
          gain: 0.045,
          pan: (i % 2 ? 0.45 : -0.45) * (cents > 0 ? 1 : 0.6),
          attack: 1.6,
          release: 1.8,
          shape: 'soft',
        });
      }
    });
    addNote(out, {
      freq: midi(chord.root),
      start,
      length: span - 0.2,
      gain: 0.12,
      pan: 0,
      attack: 0.4,
      release: 1.2,
    });
    // Arpeggio from the second scene onwards: eighth notes up and down the chord, an octave higher.
    if (start < 5) continue;
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let step = 0; step < 16; step += 1) {
      const tone = chord.tones[pattern[step % pattern.length] ?? 0] ?? 60;
      const at = start + (step * BEAT) / 2;
      if (at > duration - 3) break;
      addNote(out, {
        freq: midi(tone + 12),
        start: at,
        length: 0.05,
        gain: 0.05,
        pan: step % 2 ? 0.55 : -0.55,
        attack: 0.004,
        release: 0.6,
        decay: 0.32,
      });
    }
  }
  const fadeIn = 1.5 * RATE;
  const fadeOut = 2.5 * RATE;
  for (let i = 0; i < frames; i += 1) {
    const g = Math.min(1, i / fadeIn) * Math.min(1, (frames - i) / fadeOut);
    out.left[i] = (out.left[i] ?? 0) * g;
    out.right[i] = (out.right[i] ?? 0) * g;
  }
  writeWav(file, out.left, out.right);
}

/**
 * Transition whooshes (seeded noise through a sweeping low-pass) and a two-note end chime.
 * @param {string} file @param {number} duration @param {number[]} whooshes @param {number} chime
 */
export function writeEffects(file, duration, whooshes, chime) {
  const frames = Math.ceil(duration * RATE);
  const out = { left: new Float32Array(frames), right: new Float32Array(frames) };
  let seed = 0x2545f491;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  whooshes.forEach((at, n) => {
    const length = 0.7;
    let lowL = 0;
    let lowR = 0;
    for (let i = 0; i < length * RATE; i += 1) {
      const t = i / RATE;
      const index = Math.floor((at - 0.35) * RATE) + i;
      if (index < 0 || index >= frames) continue;
      const shape = Math.sin((Math.PI * t) / length) ** 2;
      const cutoff = 0.02 + 0.2 * shape;
      lowL += cutoff * (noise() - lowL);
      lowR += cutoff * (noise() - lowR);
      const pan = (n % 2 ? 1 : -1) * (t / length - 0.5);
      out.left[index] = (out.left[index] ?? 0) + lowL * shape * 0.5 * (1 - pan);
      out.right[index] = (out.right[index] ?? 0) + lowR * shape * 0.5 * (1 + pan);
    }
  });
  addNote(out, {
    freq: midi(88),
    start: chime,
    length: 0.02,
    gain: 0.16,
    pan: -0.2,
    attack: 0.003,
    release: 1.6,
    decay: 0.7,
  });
  addNote(out, {
    freq: midi(93),
    start: chime + 0.12,
    length: 0.02,
    gain: 0.14,
    pan: 0.2,
    attack: 0.003,
    release: 1.8,
    decay: 0.8,
  });
  writeWav(file, out.left, out.right);
}
