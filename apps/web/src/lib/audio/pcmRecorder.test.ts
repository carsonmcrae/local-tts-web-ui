// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for lossless studio capture and 24-bit WAV encoding.
 * Scope: Input listing (labels, permission-less entries, Chrome's default and communications aliases)
 *   and the preferred studio microphone, the secure-context and browser-support
 *   checks, opening a chosen device with voice processing off, collecting worklet batches until
 *   "done", the level meter, releasing the microphone, a failed start, and 24-bit PCM samples —
 *   with fake media devices, AudioContext and AudioWorkletNode (jsdom has neither).
 * Does NOT belong: The quick recorder (audio.test.ts) or the session UI.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listInputs, PcmRecorder, preferredInput, WORKLET_URL } from './pcmRecorder';
import { MicrophoneError } from './recorder';
import { encodeWavBuffer } from './wav';

class FakePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: ((event: MessageEvent) => void)[] = [];
  sent: unknown[] = [];
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }
  start() {}
  postMessage(message: unknown) {
    this.sent.push(message);
    // The worklet answers "stop" with its last batch, then "done".
    if (message === 'stop') for (const data of [new Float32Array([0.5]), 'done']) this.emit(data);
  }
  emit(data: unknown) {
    const event = { data } as MessageEvent;
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

const audio = vi.hoisted(() => ({
  nodes: [] as { port: FakePort; disconnect: () => void }[],
  closed: 0,
}));

function connectable() {
  return { connect: (next: unknown) => next ?? connectable(), disconnect: vi.fn() };
}

function installAudio({ secure = true, worklet = true } = {}) {
  const stopTrack = vi.fn();
  const track: { stop: () => void; onended?: (() => void) | null } = { stop: stopTrack };
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
  vi.stubGlobal('isSecureContext', secure);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: async () => [
        { kind: 'audioinput', deviceId: 'default', label: 'Default - USB Mic' },
        { kind: 'audioinput', deviceId: 'communications', label: 'Communications - USB Mic' },
        { kind: 'audioinput', deviceId: 'usb', label: 'USB Mic' },
        { kind: 'audioinput', deviceId: 'second', label: '' },
        { kind: 'audioinput', deviceId: '', label: '' },
        { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
      ],
    },
  });
  class FakeContext {
    sampleRate = 48_000;
    destination = {};
    audioWorklet = { addModule: vi.fn(async () => undefined) };
    createMediaStreamSource = () => connectable();
    createAnalyser = () => ({
      fftSize: 0,
      connect: vi.fn(),
      getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(0.5),
    });
    createGain = () => ({ gain: { value: 1 }, ...connectable() });
    close = async () => {
      audio.closed += 1;
    };
  }
  vi.stubGlobal('AudioContext', FakeContext);
  if (worklet) {
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = new FakePort();
        disconnect = vi.fn();
        connect = (next: unknown) => next;
        constructor() {
          audio.nodes.push(this);
        }
      },
    );
  } else vi.stubGlobal('AudioWorkletNode', undefined);
  return { getUserMedia, stopTrack, track };
}

afterEach(() => {
  vi.unstubAllGlobals();
  audio.nodes = [];
  audio.closed = 0;
});

describe('listInputs', () => {
  it('lists microphones with a fallback label, skipping entries without permission', async () => {
    installAudio();
    expect(await listInputs()).toEqual([
      { deviceId: 'usb', label: 'USB Mic' },
      { deviceId: 'second', label: 'Microphone 2' },
    ]);
  });

  it('prefers a studio microphone over webcams and headsets', () => {
    const inputs = [
      { deviceId: 'cam', label: 'Microphone (HD Pro Webcam C920)' },
      { deviceId: 'headset', label: 'Microphone (HyperX Cloud III Wireless)' },
      { deviceId: 'rode', label: 'Microphone (RODE NT-USB)' },
    ];
    expect(preferredInput(inputs)?.deviceId).toBe('rode');
    expect(preferredInput(inputs.slice(0, 2))).toBeUndefined();
  });

  it('returns nothing without media devices', async () => {
    vi.stubGlobal('navigator', {});
    expect(await listInputs()).toEqual([]);
  });
});

describe('PcmRecorder', () => {
  it('needs a secure page and a browser with audio worklets', async () => {
    installAudio({ secure: false });
    await expect(new PcmRecorder().start()).rejects.toMatchObject({ code: 'insecure' });
    installAudio({ worklet: false });
    await expect(new PcmRecorder().start()).rejects.toBeInstanceOf(MicrophoneError);
  });

  it('records the chosen input losslessly with voice processing off', async () => {
    const { getUserMedia, stopTrack } = installAudio();
    const recorder = new PcmRecorder();
    expect(recorder.level()).toBe(0);
    await recorder.start('usb');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'usb' },
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(recorder.level()).toBeGreaterThan(0.8);
    audio.nodes[0]?.port.emit(new Float32Array([0.1, 0.2]));
    const clip = await recorder.stop();
    expect(Array.from(clip.samples)).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.5),
    ]);
    expect(clip.sampleRate).toBe(48_000);
    expect(stopTrack).toHaveBeenCalled();
    expect(audio.closed).toBe(1);
  });

  it('uses the default input when none is chosen and stops cleanly when idle', async () => {
    const { getUserMedia } = installAudio();
    const recorder = new PcmRecorder();
    expect(await recorder.stop()).toEqual({ samples: new Float32Array(0), sampleRate: 48_000 });
    await recorder.start();
    expect(getUserMedia.mock.calls[0]).toEqual([
      expect.objectContaining({
        audio: expect.not.objectContaining({ deviceId: expect.anything() }),
      }),
    ]);
    recorder.release();
    recorder.release();
    expect(audio.nodes[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(WORKLET_URL).toBe('/audio/capture-worklet.js');
  });

  it('says when the microphone is unplugged, and when the recorder itself cannot start', async () => {
    const { track } = installAudio();
    const unplugged = vi.fn();
    await new PcmRecorder().start(undefined, unplugged);
    track.onended?.();
    expect(unplugged).toHaveBeenCalledTimes(1);
    installAudio();
    const failing = class extends (globalThis.AudioContext as unknown as new () => object) {
      audioWorklet = { addModule: vi.fn(async () => Promise.reject(new Error('blocked'))) };
    };
    vi.stubGlobal('AudioContext', failing);
    await expect(new PcmRecorder().start()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('explains a microphone that could not be opened', async () => {
    const { getUserMedia } = installAudio();
    getUserMedia.mockRejectedValueOnce(new DOMException('busy', 'NotReadableError'));
    await expect(new PcmRecorder().start()).rejects.toMatchObject({ code: 'busy' });
  });
});

describe('24-bit WAV', () => {
  it('writes three bytes per sample, full scale both ways', () => {
    const view = new DataView(encodeWavBuffer(new Float32Array([1, -1, 0.5]), 48_000, 24));
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint32(40, true)).toBe(9);
    const sample = (i: number) =>
      view.getUint16(44 + i * 3, true) | (view.getInt8(44 + i * 3 + 2) << 16);
    expect([sample(0), sample(1), sample(2)]).toEqual([8_388_607, -8_388_608, 4_194_304]);
  });
});
