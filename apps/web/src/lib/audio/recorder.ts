// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Record from the microphone with a live input-level meter.
 * Scope: Permission request with plain-language errors (denied, no device, busy, a device that stopped
 *   responding, insecure context), each a short message plus a hint on what to do,
 *   MediaRecorder capture in whatever format the browser supports (decoded later by wav.ts), an
 *   AnalyserNode for the level meter, and full release of the microphone on stop/cancel.
 * Does NOT belong: Conversion, analysis or upload.
 */

export type MicrophoneProblem =
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'no-device'
  | 'busy'
  | 'device' // the device stopped responding
  | 'disconnected' // unplugged during a take
  | 'empty' // a take with no sound at all
  | 'unknown';

/** A microphone problem: one message saying what happened, and an optional hint on what to do. */
export class MicrophoneError extends Error {
  constructor(
    readonly code: MicrophoneProblem,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'MicrophoneError';
  }
}

export function explainMicrophoneError(error: unknown): MicrophoneError {
  if (error instanceof MicrophoneError) return error;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new MicrophoneError(
      'denied',
      'Microphone access was blocked.',
      'Allow the microphone in your browser’s site settings (the icon beside the address), then try again.',
    );
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new MicrophoneError(
      'no-device',
      'No microphone was found.',
      'Connect one, or import an existing recording instead.',
    );
  if (name === 'NotReadableError')
    return new MicrophoneError(
      'busy',
      'The microphone is in use by another app.',
      'Close the other app (a call or another recorder), then try again.',
    );
  if (name === 'AbortError')
    return new MicrophoneError(
      'device',
      'The microphone stopped responding.',
      'Unplug it and plug it back in, or choose another microphone.',
    );
  return new MicrophoneError(
    'unknown',
    'The microphone could not be started.',
    'Reload the page and try again. If it keeps happening, restart the browser.',
  );
}

/** The message and its hint as one sentence pair, for places that show a single line. */
export function describeMicrophoneError(error: unknown): string {
  const problem = explainMicrophoneError(error);
  return problem.hint ? `${problem.message} ${problem.hint}` : problem.message;
}

/** An analyser's current level 0..1: RMS mapped from -60..0 dBFS (0 without an analyser). */
export function inputLevel(
  analyser: AnalyserNode | null,
  buffer: Float32Array<ArrayBuffer>,
): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const value of buffer) sum += value * value;
  const db = 20 * Math.log10(Math.sqrt(sum / buffer.length) + 1e-9);
  return Math.min(Math.max((db + 60) / 60, 0), 1);
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private readonly levelBuffer = new Float32Array(2048);

  static check(): void {
    if (!globalThis.isSecureContext)
      throw new MicrophoneError(
        'insecure',
        'Recording needs a secure page (localhost or HTTPS).',
        'Import a recording instead, or open the app on this computer.',
      );
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw new MicrophoneError(
        'unsupported',
        'This browser can’t record audio. Import a recording instead.',
      );
  }

  async start(): Promise<void> {
    MicRecorder.check();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw explainMicrophoneError(error);
    }
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(250);
  }

  /** Current input level 0..1 (RMS mapped from -60..0 dBFS). */
  level(): number {
    return inputLevel(this.analyser, this.levelBuffer);
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(new Blob());
    return new Promise((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          const blob = new Blob(this.chunks, { type: recorder.mimeType });
          this.release();
          resolve(blob);
        },
        { once: true },
      );
      recorder.stop();
    });
  }

  release(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = null;
    this.recorder = null;
    this.context = null;
    this.analyser = null;
  }
}
