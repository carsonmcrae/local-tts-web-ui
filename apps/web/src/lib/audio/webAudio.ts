// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The slice of Web Audio that the background-music and sound-effects engines share.
 * Scope: Structural types for the nodes, parameters, buffers and context the engines touch (so a
 *   fake can stand in for a browser), a short linear ramp for a parameter, the audible bounds of a
 *   decoded buffer for a loop (skipping the digital silence a codec leaves at the edges), a loop whose
 *   seam is crossfaded so it joins without a jump whatever the decoder did at the edges, a master
 *   gain wired to the speakers, and one fetch-and-decode per id while it is in flight.
 * Does NOT belong: What plays and when (each engine), or the narration (an audio element).
 */

export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface BufferLike {
  readonly duration: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(when: number, offset: number, duration?: number): void;
  stop(when: number): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

export interface ContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** Codec padding is at most a few tens of milliseconds; never trim more than this. */
const EDGE_SCAN_SECONDS = 0.2;
/** -100 dBFS: quiet music is louder than this; decoder padding is not. */
const SILENT = 1e-5;
/** The crossfade at a loop's seam: far longer than any decoder's edge error, too short to hear. */
const SEAM_SECONDS = 0.03;
const seamless = new WeakMap<BufferLike, { start: number; end: number }>();

/**
 * Where a loop runs once its seam is crossfaded. The loop's last 30 ms are blended into its first 30 ms
 * (equal power), in place, and the loop ends 30 ms earlier, so the join is continuous whatever a
 * decoder did at the edges: Chromium 156 decodes Opus 24 samples short at the start, which a
 * sample-exact loop would turn into a jump at every repeat. Blended once per buffer; later calls return
 * the same bounds.
 */
export function seamlessLoop(buffer: BufferLike): { start: number; end: number } {
  const known = seamless.get(buffer);
  if (known) return known;
  const bounds = loopBounds(buffer);
  const first = Math.round(bounds.start * buffer.sampleRate);
  const last = Math.round(bounds.end * buffer.sampleRate);
  const blend = Math.min(Math.round(SEAM_SECONDS * buffer.sampleRate), (last - first) >> 2);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < blend; i += 1) {
      const angle = ((i + 0.5) / blend) * (Math.PI / 2);
      data[first + i] =
        Number(data[first + i]) * Math.sin(angle) +
        Number(data[last - blend + i]) * Math.cos(angle);
    }
  }
  const loop = { start: bounds.start, end: (last - blend) / buffer.sampleRate };
  seamless.set(buffer, loop);
  return loop;
}

/** Move `param` to `to` over `seconds` from `now`, from wherever it is, cancelling what was planned. */
export function ramp(param: ParamLike, now: number, to: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + Math.max(seconds, 0.01));
}

/** Where a loop runs: the whole buffer minus the silence (below `silent`) a decoder left at either edge. */
export function loopBounds(buffer: BufferLike, silent = SILENT): { start: number; end: number } {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const audible = (at: number) => channels.some((data) => Math.abs(Number(data[at])) > silent);
  const limit = Math.min(Math.floor(buffer.sampleRate * EDGE_SCAN_SECONDS), buffer.length >> 1);
  let first = 0;
  while (first < limit && !audible(first)) first += 1;
  let last = buffer.length;
  while (buffer.length - last < limit && !audible(last - 1)) last -= 1;
  // A buffer that is silent throughout keeps its full length rather than an empty loop.
  if (last <= first) return { start: 0, end: buffer.duration };
  return { start: first / buffer.sampleRate, end: last / buffer.sampleRate };
}

/** Move the master gain to `volume` over `seconds`, once there is a graph to move. */
export function setMasterVolume(
  context: ContextLike | null,
  master: GainLike | null,
  volume: number,
  seconds: number,
): void {
  if (context && master) ramp(master.gain, context.currentTime, volume, seconds);
}

/** A master gain at `volume`, wired to the speakers. */
export function createMaster(context: ContextLike, volume: number): GainLike {
  const master = context.createGain();
  master.gain.setValueAtTime(volume, context.currentTime);
  master.connect(context.destination);
  return master;
}

/** Fetch and decode `id` once while it is in flight; `keep` sees the buffer before callers do. */
export function loadOnce(
  loading: Map<string, Promise<BufferLike>>,
  id: string,
  fetch: () => Promise<ArrayBuffer>,
  context: ContextLike,
  keep: (buffer: BufferLike) => void,
): Promise<BufferLike> {
  let promise = loading.get(id);
  if (!promise) {
    promise = fetch()
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        keep(buffer);
        return buffer;
      })
      .finally(() => loading.delete(id));
    loading.set(id, promise);
  }
  return promise;
}
