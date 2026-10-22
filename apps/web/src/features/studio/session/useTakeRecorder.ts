// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Record one lossless take with a live level meter and an automatic stop.
 * Scope: Starts a PcmRecorder on the chosen input, updates elapsed time and level every animation
 *   frame, stops itself at `maxSeconds` (handing the clip to `onClip`), and releases the microphone
 *   when the component unmounts. Microphone problems become a plain-language error with a hint:
 *   blocked or missing devices, a device unplugged mid-take (the partial take is dropped) and a take
 *   with no sound at all (never uploaded).
 * Does NOT belong: Encoding, upload or which passage is being read.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmRecorder, type RawClip } from '@/lib/audio/pcmRecorder';
import { explainMicrophoneError, MicrophoneError } from '@/lib/audio/recorder';

export function useTakeRecorder(maxSeconds: number, onClip: (clip: RawClip) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<MicrophoneError | null>(null);
  const recorder = useRef<PcmRecorder | null>(null);
  const frame = useRef(0);
  const deliver = useRef(onClip);

  useEffect(() => {
    deliver.current = onClip;
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      recorder.current?.release();
    },
    [],
  );

  const halt = useCallback(() => {
    const active = recorder.current;
    cancelAnimationFrame(frame.current);
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    return active;
  }, []);

  const stop = useCallback(async () => {
    const active = halt();
    if (!active) return;
    const clip = await active.stop();
    if (clip.samples.length === 0 || !clip.samples.every(Number.isFinite)) {
      setError(
        new MicrophoneError(
          'empty',
          'Nothing was recorded.',
          'The microphone sent no sound. Check that it isn’t muted, then record again.',
        ),
      );
      return;
    }
    deliver.current(clip);
  }, [halt]);

  const lost = useCallback(() => {
    halt()?.release();
    setError(
      new MicrophoneError(
        'disconnected',
        'The microphone was disconnected during the take, so the take wasn’t kept.',
        'Reconnect it, check that it’s selected in the microphone check, then record again.',
      ),
    );
  }, [halt]);

  const start = useCallback(
    async (deviceId: string | undefined) => {
      setError(null);
      const next = new PcmRecorder();
      try {
        await next.start(deviceId, lost);
      } catch (error_) {
        next.release();
        setError(explainMicrophoneError(error_));
        return;
      }
      recorder.current = next;
      setElapsed(0);
      setRecording(true);
      const begin = performance.now();
      const tick = () => {
        const seconds = (performance.now() - begin) / 1000;
        setElapsed(seconds);
        setLevel(next.level());
        if (seconds >= maxSeconds) void stop();
        else frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [maxSeconds, stop, lost],
  );

  return { recording, elapsed, level, error, start, stop };
}
