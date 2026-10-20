// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Record one lossless take with a live level meter and an automatic stop.
 * Scope: Starts a PcmRecorder on the chosen input, updates elapsed time and level every animation
 *   frame, stops itself at `maxSeconds` (handing the clip to `onClip`), and releases the microphone
 *   when the component unmounts. Microphone problems become a plain-language error message.
 * Does NOT belong: Encoding, upload or which passage is being read.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmRecorder, type RawClip } from '@/lib/audio/pcmRecorder';
import { explainMicrophoneError } from '@/lib/audio/recorder';

export function useTakeRecorder(maxSeconds: number, onClip: (clip: RawClip) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

  const stop = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    cancelAnimationFrame(frame.current);
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    deliver.current(await active.stop());
  }, []);

  const start = useCallback(
    async (deviceId: string | undefined) => {
      setError(null);
      const next = new PcmRecorder();
      try {
        await next.start(deviceId);
      } catch (error_) {
        next.release();
        setError(explainMicrophoneError(error_).message);
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
    [maxSeconds, stop],
  );

  return { recording, elapsed, level, error, start, stop };
}
