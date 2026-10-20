/**
 * Purpose: AudioWorklet processor that hands raw microphone samples to the page, losslessly.
 * Scope: Copies the first input channel into batches of 4096 frames sent over the message port; on a
 *   "stop" message it sends what is left, then "done", and stops processing.
 * Does NOT belong: Capture setup and encoding (src/lib/audio/pcmRecorder.ts).
 */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.filled = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data !== 'stop') return;
      this.flush();
      this.stopped = true;
      this.port.postMessage('done');
    };
  }

  flush() {
    if (this.filled === 0) return;
    this.port.postMessage(this.buffer.slice(0, this.filled));
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && !this.stopped) {
      for (const value of channel) {
        this.buffer[this.filled] = value;
        this.filled += 1;
        if (this.filled === this.buffer.length) this.flush();
      }
    }
    return !this.stopped;
  }
}

registerProcessor('pcm-capture', PcmCapture);
