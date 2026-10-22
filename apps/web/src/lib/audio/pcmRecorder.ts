// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Lossless microphone capture for studio voice sessions.
 * Scope: Lists audio inputs (without Chrome's "Default" and "Communications" aliases) and picks the
 *   likeliest studio microphone, opens the chosen one with every browser voice-processing stage off (echo
 *   cancellation, noise suppression, auto-gain), streams raw samples through an AudioWorklet served
 *   same-origin from /audio/capture-worklet.js, drives the same live level meter as MicRecorder, and
 *   releases the microphone on stop or cancel, telling the caller when the device is unplugged
 *   mid-take. Returns float samples at the device's own rate.
 * Does NOT belong: Encoding (wav.ts), analysis or upload.
 */
import { explainMicrophoneError, inputLevel, MicrophoneError, requireSecurePage } from './recorder';

export const WORKLET_URL = '/audio/capture-worklet.js';

export interface AudioInput {
  deviceId: string;
  label: string;
}

export interface RawClip {
  samples: Float32Array;
  sampleRate: number;
}

// Chrome lists the current default and communications devices twice, under these ids.
const ALIASES = new Set(['', 'default', 'communications']);
const STUDIO =
  /usb|xlr|rode|blue|yeti|shure|audio-technica|at20|samson|elgato|wave:|focusrite|scarlett|zoom|seiren|quadcast|fifine|maono|condenser/i;
const CASUAL =
  /webcam|camera|headset|hands-free|cloud|wireless|array|built-in|realtek|virtual|stereo mix|bluetooth/i;

/** The microphones the browser offers; labels appear once the page has microphone permission. */
export async function listInputs(): Promise<AudioInput[]> {
  const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return devices
    .filter((device) => device.kind === 'audioinput' && !ALIASES.has(device.deviceId))
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    }));
}

/** The input that looks most like a studio microphone (USB/XLR, not a webcam or headset), if any. */
export function preferredInput(inputs: readonly AudioInput[]): AudioInput | undefined {
  return inputs.find((input) => STUDIO.test(input.label) && !CASUAL.test(input.label));
}

function join(chunks: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class PcmRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private readonly levelBuffer = new Float32Array(2048);

  static check(): void {
    requireSecurePage();
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined')
      throw new MicrophoneError(
        'unsupported',
        'This browser can’t record studio takes.',
        'Use a current Chrome, Edge, Firefox or Safari, or import a recording.',
      );
  }

  /** Open the microphone and start capturing; ``onEnded`` runs if the device goes away while recording. */
  async start(deviceId?: string, onEnded?: () => void): Promise<void> {
    PcmRecorder.check();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (error) {
      throw explainMicrophoneError(error);
    }
    for (const track of this.stream.getTracks()) track.onended = () => onEnded?.();
    const context = new AudioContext();
    this.context = context;
    try {
      await context.audioWorklet.addModule(WORKLET_URL);
    } catch {
      this.release();
      throw new MicrophoneError(
        'unsupported',
        'The studio recorder couldn’t start in this browser.',
        'Reload the page, or use a current Chrome, Edge, Firefox or Safari. You can also import a recording.',
      );
    }
    const source = context.createMediaStreamSource(this.stream);
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.chunks = [];
    this.node = new AudioWorkletNode(context, 'pcm-capture');
    this.node.port.onmessage = (event: MessageEvent<Float32Array | 'done'>) => {
      if (event.data !== 'done') this.chunks.push(event.data);
    };
    // A muted path to the output keeps the graph pulling audio through the worklet.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(this.node).connect(mute).connect(context.destination);
  }

  /** Current input level 0..1, as for MicRecorder. */
  level(): number {
    return inputLevel(this.analyser, this.levelBuffer);
  }

  /** Stop and return everything recorded, at the input's own sample rate. */
  stop(): Promise<RawClip> {
    const { node, context } = this;
    if (!node || !context)
      return Promise.resolve({ samples: new Float32Array(0), sampleRate: 48_000 });
    return new Promise((resolve) => {
      node.port.addEventListener('message', (event: MessageEvent<Float32Array | 'done'>) => {
        if (event.data !== 'done') return;
        const clip = { samples: join(this.chunks), sampleRate: context.sampleRate };
        this.release();
        resolve(clip);
      });
      node.port.start();
      node.port.postMessage('stop');
    });
  }

  release(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.node = null;
  }
}
