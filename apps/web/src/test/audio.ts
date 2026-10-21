// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A fake Web Audio context for testing the background-music engine without speakers.
 * Scope: Gain automation recorded as events, sources that report start/stop/loop settings and can
 *   be ended on demand, a count of nodes still connected (to catch leaks), decoding that resolves to
 *   buffers of chosen samples or rejects, and suspend/resume/close states. Mirrors the subset of
 *   AudioContext that engine.ts uses.
 * Does NOT belong: Assertions, or the engine's own logic.
 */
import { vi } from 'vitest';
import type {
  BufferLike,
  ContextLike,
  GainLike,
  NodeLike,
  ParamLike,
  SourceLike,
} from '@/features/music/engine';

type ParamEvent = { type: 'set' | 'ramp' | 'cancel'; value: number; time: number };

export class FakeParam implements ParamLike {
  value: number;
  readonly events: ParamEvent[] = [];
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number) {
    this.events.push({ type: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: 'ramp', value, time });
  }
  cancelScheduledValues(time: number) {
    this.events.push({ type: 'cancel', value: Number.NaN, time });
  }
  /** The last value scheduled. */
  get target(): number {
    return this.events.filter((event) => event.type !== 'cancel').at(-1)?.value ?? this.value;
  }
}

class FakeNode implements NodeLike {
  readonly outputs = new Set<NodeLike>();
  constructor(protected readonly context: FakeAudioContext) {}
  connect(destination: NodeLike) {
    this.outputs.add(destination);
    this.context.connected.add(this);
  }
  disconnect() {
    this.outputs.clear();
    this.context.connected.delete(this);
  }
}

export class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam(1);
}

export class FakeSource extends FakeNode implements SourceLike {
  buffer: BufferLike | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: { when: number; offset: number } | null = null;
  stoppedAt: number | null = null;
  hasEnded = false;
  private readonly ended: (() => void)[] = [];
  start(when: number, offset: number) {
    this.started = { when, offset };
  }
  stop(when: number) {
    this.stoppedAt = when;
  }
  addEventListener(_type: 'ended', listener: () => void) {
    this.ended.push(listener);
  }
  /** The scheduled stop time was reached. */
  end() {
    if (this.hasEnded) return;
    this.hasEnded = true;
    for (const listener of this.ended) listener();
  }
}

/** A decoded track: `seconds` long at 1 kHz, with `edge` samples of silence at each end. */
export function fakeBuffer(seconds: number, edge = 0, channels = 2): BufferLike {
  const sampleRate = 1000;
  const length = Math.round(seconds * sampleRate);
  const data = Array.from({ length: channels }, () => {
    const samples = new Float32Array(length).fill(0.5);
    samples.fill(0, 0, edge);
    samples.fill(0, length - edge);
    return samples;
  });
  return {
    duration: length / sampleRate,
    length,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: (channel: number) => data[channel] as Float32Array,
  };
}

export class FakeAudioContext implements ContextLike {
  currentTime = 0;
  state = 'running';
  readonly connected = new Set<NodeLike>();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly destination: NodeLike = { connect: () => undefined, disconnect: () => undefined };
  /** What the next decode returns (a function for per-call control). */
  decode: (data: ArrayBuffer) => Promise<BufferLike> = () => Promise.resolve(fakeBuffer(60));
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  createGain() {
    const gain = new FakeGain(this);
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource(this);
    this.sources.push(source);
    return source;
  }
  decodeAudioData(data: ArrayBuffer) {
    return this.decode(data);
  }
  /** Sources started and not yet stopped. */
  get playing(): FakeSource[] {
    return this.sources.filter((source) => source.started && source.stoppedAt === null);
  }
  /** Let every scheduled stop up to `time` happen. */
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const source of this.sources)
      if (source.stoppedAt !== null && source.stoppedAt <= this.currentTime) source.end();
  }
}
