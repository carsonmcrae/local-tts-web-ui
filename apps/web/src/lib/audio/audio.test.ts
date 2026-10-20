// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Unit tests for the in-browser audio helpers: decoding and resampling, quality analysis
 *   edge cases and microphone recording.
 * Scope: Web Audio, MediaRecorder and getUserMedia are replaced by small fakes (jsdom has none), so
 *   these tests check how the helpers drive those APIs and handle their failures.
 * Does NOT belong: Real audio quality (server tests) or recording UI (studio tests).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSamples } from './analysis';
import { explainMicrophoneError, MicrophoneError, MicRecorder } from './recorder';
import { decodeToClip, mixToMono, resampleLinear } from './wav';

afterEach(() => vi.unstubAllGlobals());

/** A decoded stereo buffer at `rate` whose channels hold constant values. */
function decodingContext(seconds: number, rate: number, close = vi.fn(async () => undefined)) {
  const length = seconds * rate;
  return class {
    close = close;
    async decodeAudioData() {
      return {
        numberOfChannels: 2,
        sampleRate: rate,
        getChannelData: (channel: number) => new Float32Array(length).fill(channel ? 0.2 : 0.4),
      };
    }
  };
}

describe('wav conversion', () => {
  it('mixes channels, treating a shorter channel as silence past its end', () => {
    expect(mixToMono([])).toHaveLength(0);
    const single = new Float32Array([0.5]);
    expect(mixToMono([single])).toBe(single);
    expect(Array.from(mixToMono([new Float32Array([1, 1]), new Float32Array([1])]))).toEqual([
      1, 0.5,
    ]);
  });

  it('interpolates when upsampling and holds the last sample at the end', () => {
    expect(resampleLinear(new Float32Array([0, 1]), 1, 2)).toEqual(
      new Float32Array([0, 0.5, 1, 1]),
    );
    const same = new Float32Array([0.1]);
    expect(resampleLinear(same, 24_000, 24_000)).toBe(same);
  });

  it('decodes, down-mixes and resamples with OfflineAudioContext when available', async () => {
    const close = vi.fn(async () => undefined);
    vi.stubGlobal('AudioContext', decodingContext(1, 48_000, close));
    const copied = vi.fn();
    const started = vi.fn();
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        destination = {};
        constructor(
          readonly channels: number,
          readonly length: number,
          readonly rate: number,
        ) {}
        createBuffer = () => ({ copyToChannel: copied });
        createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: started });
        startRendering = async () => ({
          getChannelData: () => new Float32Array(this.length).fill(0.3),
        });
      },
    );
    const clip = await decodeToClip(new ArrayBuffer(8), 5);
    expect(clip).toMatchObject({ sampleRate: 24_000, trimmed: false });
    expect(clip.samples).toHaveLength(24_000);
    expect(clip.samples[0]).toBeCloseTo(0.3);
    expect(copied.mock.calls[0]?.[0]?.[0]).toBeCloseTo(0.3); // the mono mix of 0.4 and 0.2
    expect(started).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('trims long clips and falls back to webkitAudioContext and linear resampling', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', decodingContext(3, 48_000));
    const clip = await decodeToClip(new ArrayBuffer(8), 2);
    expect(clip.trimmed).toBe(true);
    expect(clip.samples).toHaveLength(48_000);
  });

  it('keeps audio that is already at the target rate', async () => {
    vi.stubGlobal('AudioContext', decodingContext(1, 24_000));
    const clip = await decodeToClip(new ArrayBuffer(8), 5);
    expect(clip.samples).toHaveLength(24_000);
  });

  it('closes the decoder even when decoding fails', async () => {
    const close = vi.fn(async () => undefined);
    vi.stubGlobal(
      'AudioContext',
      class {
        close = close;
        decodeAudioData = async () => Promise.reject(new Error('unsupported codec'));
      },
    );
    await expect(decodeToClip(new ArrayBuffer(8), 5)).rejects.toThrow('unsupported codec');
    expect(close).toHaveBeenCalled();
  });
});

describe('analysis edge cases', () => {
  it('reports an empty recording as silent and too short', () => {
    const report = analyzeSamples(new Float32Array(0), 24_000);
    expect(report).toMatchObject({ durationS: 0, clippingRatio: 0, pauseRatio: 1, ok: false });
    expect(report.issues.map((issue) => issue.code)).toContain('too_short');
  });

  it('treats digital silence as having no speech', () => {
    const report = analyzeSamples(new Float32Array(24_000), 24_000);
    expect(report.speechS).toBe(0);
    expect(report.pauseRatio).toBe(1);
    expect(report.rmsDbfs).toBeLessThan(-100);
  });
});

describe('microphone errors', () => {
  it('explains each failure in plain language', () => {
    const own = new MicrophoneError('busy', 'In use.');
    expect(explainMicrophoneError(own)).toBe(own);
    const code = (name: string) => explainMicrophoneError(new DOMException('x', name)).code;
    expect(code('NotAllowedError')).toBe('denied');
    expect(code('SecurityError')).toBe('denied');
    expect(code('NotFoundError')).toBe('no-device');
    expect(code('OverconstrainedError')).toBe('no-device');
    expect(code('NotReadableError')).toBe('busy');
    expect(explainMicrophoneError(new Error('boom'))).toMatchObject({
      code: 'unknown',
      name: 'MicrophoneError',
    });
  });
});

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  private listeners = new Map<string, ((event: { data: Blob }) => void)[]>();
  constructor(readonly stream: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data: Blob }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data = new Blob()) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.emit('dataavailable', new Blob(['tail']));
    this.emit('stop');
  }
}

/** Installs fake capture APIs; `level` is the constant sample value the analyser reports. */
function installMicrophone({ secure = true, level = 0.1 } = {}) {
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
  const close = vi.fn(async () => undefined);
  vi.stubGlobal('isSecureContext', secure);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close;
      createAnalyser = () => ({
        fftSize: 0,
        getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(level),
      });
      createMediaStreamSource = () => ({ connect: vi.fn() });
    },
  );
  return { track, getUserMedia, close };
}

describe('MicRecorder', () => {
  it('refuses to start on an insecure page or without recording support', async () => {
    installMicrophone({ secure: false });
    await expect(new MicRecorder().start()).rejects.toMatchObject({ code: 'insecure' });
    installMicrophone();
    vi.stubGlobal('navigator', {});
    await expect(new MicRecorder().start()).rejects.toMatchObject({ code: 'unsupported' });
    installMicrophone();
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(new MicRecorder().start()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('turns a blocked permission prompt into a friendly error', async () => {
    const { getUserMedia } = installMicrophone();
    getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    await expect(new MicRecorder().start()).rejects.toMatchObject({ code: 'denied' });
  });

  it('records, meters the input level and releases the microphone on stop', async () => {
    const { track, close } = installMicrophone({ level: 0.1 });
    const recorder = new MicRecorder();
    expect(recorder.level()).toBe(0);
    await recorder.start();
    expect(recorder.level()).toBeCloseTo((20 * Math.log10(0.1) + 60) / 60, 2);
    const media = FakeMediaRecorder.instances.at(-1) as FakeMediaRecorder;
    media.emit('dataavailable', new Blob([]));
    media.emit('dataavailable', new Blob(['head']));
    const blob = await recorder.stop();
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBe('headtail'.length); // empty chunks are skipped
    expect(track.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(recorder.level()).toBe(0);
    expect((await recorder.stop()).size).toBe(0);
  });

  it('stops an active recording when released early', async () => {
    installMicrophone();
    const recorder = new MicRecorder();
    await recorder.start();
    const media = FakeMediaRecorder.instances.at(-1) as FakeMediaRecorder;
    recorder.release();
    expect(media.state).toBe('inactive');
    recorder.release();
  });
});
