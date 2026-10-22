// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The slice of Web Audio that the background-music and sound-effects engines share.
 * Scope: Structural types for the nodes, parameters, buffers and context the engines touch (so a
 *   fake can stand in for a browser), a short linear ramp for a parameter, the audible bounds of a
 *   decoded buffer for a loop (skipping the digital silence a codec leaves at the edges), a master
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
