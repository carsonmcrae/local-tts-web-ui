/**
 * Purpose: Record from the microphone with a live input-level meter.
 * Scope: Permission request with plain-language errors (denied, no device, insecure context),
 *   MediaRecorder capture in whatever format the browser supports (decoded later by wav.ts), an
 *   AnalyserNode for the level meter, and full release of the microphone on stop/cancel.
 * Does NOT belong: Conversion, analysis or upload.
 */

export class MicrophoneError extends Error {
  constructor(
    readonly code: 'insecure' | 'unsupported' | 'denied' | 'no-device' | 'busy' | 'unknown',
    message: string,
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
      'Microphone access was blocked. Allow it in your browser’s site settings, then try again.',
    );
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new MicrophoneError(
      'no-device',
      'No microphone was found. Connect one, or import an existing recording instead.',
    );
  if (name === 'NotReadableError')
    return new MicrophoneError(
      'busy',
      'The microphone is in use by another app. Close it and try again.',
    );
  return new MicrophoneError('unknown', 'The microphone could not be started.');
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private readonly levelBuffer = new Float32Array(2048);

  static check(): void {
    if (!window.isSecureContext)
      throw new MicrophoneError(
        'insecure',
        'Recording needs a secure page (localhost or HTTPS). Import a recording instead, or open the app on this computer.',
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
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const value of this.levelBuffer) sum += value * value;
    const db = 20 * Math.log10(Math.sqrt(sum / this.levelBuffer.length) + 1e-9);
    return Math.min(Math.max((db + 60) / 60, 0), 1);
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
