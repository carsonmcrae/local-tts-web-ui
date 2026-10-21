// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Capture a reference recording — record with guidance, or import an existing file.
 * Scope: Script display and switching, microphone permission handling, record/stop with a live level
 *   meter, elapsed time against the recommended length, auto-stop, playback, retake, and audio file
 *   import (decoded and converted in the browser). Produces a 24 kHz mono clip for the next step.
 * Does NOT belong: Quality review, naming or consent (later steps).
 */
import { FileAudio, Mic, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner, ProgressBar } from '@/components/ui/Feedback';
import { formatClock } from '@/lib/format';
import { describeMicrophoneError, MicRecorder } from '@/lib/audio/recorder';
import { decodeToClip } from '@/lib/audio/wav';
import { LevelMeter } from './LevelMeter';
import { SCRIPTS } from './script';

export interface CapturedClip {
  samples: Float32Array;
  sampleRate: number;
  source: 'recording' | 'import';
  note?: string;
}

const MAX_RECORD_S = 45;
const TARGET_S = 20;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function CaptureStep({
  onCaptured,
}: Readonly<{ onCaptured: (clip: CapturedClip) => void }>) {
  const [scriptIndex, setScriptIndex] = useState(0);
  // The recorder while a take is in progress (null when idle).
  const [active, setActive] = useState<MicRecorder | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Mirrors `active` for the unmount cleanup, which must release the microphone.
  const recorder = useRef<MicRecorder | null>(null);
  const frame = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const recording = active !== null;
  const script = SCRIPTS[scriptIndex];

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      recorder.current?.release();
    },
    [],
  );

  const finish = async (session: MicRecorder) => {
    cancelAnimationFrame(frame.current);
    recorder.current = null;
    setActive(null);
    setBusy(true);
    try {
      const blob = await session.stop();
      const clip = await decodeToClip(await blob.arrayBuffer(), MAX_RECORD_S + 5);
      onCaptured({ samples: clip.samples, sampleRate: clip.sampleRate, source: 'recording' });
    } catch {
      setErrorMessage('The recording could not be processed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setErrorMessage(null);
    const next = new MicRecorder();
    try {
      await next.start();
    } catch (error) {
      setErrorMessage(describeMicrophoneError(error));
      return;
    }
    recorder.current = next;
    setElapsed(0);
    setActive(next);
    const begin = performance.now();
    const tick = () => {
      const seconds = (performance.now() - begin) / 1000;
      setElapsed(seconds);
      setLevel(next.level());
      if (seconds >= MAX_RECORD_S) void finish(next);
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const importFile = async (file: File) => {
    setErrorMessage(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setErrorMessage('That file is larger than 20 MB. Trim it to under a minute and try again.');
      return;
    }
    setBusy(true);
    try {
      const clip = await decodeToClip(await file.arrayBuffer(), 45);
      onCaptured({
        samples: clip.samples,
        sampleRate: clip.sampleRate,
        source: 'import',
        ...(clip.trimmed ? { note: 'Only the first 45 seconds were kept.' } : {}),
      });
    } catch {
      setErrorMessage('This browser couldn’t decode that file. Try WAV, MP3, M4A or FLAC.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Read this aloud <span className="font-normal text-muted">· {script?.seconds}</span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={14} />}
            disabled={recording}
            onClick={() => setScriptIndex((scriptIndex + 1) % SCRIPTS.length)}
          >
            Different passage
          </Button>
        </div>
        <p className="font-serif text-lg leading-relaxed sm:text-xl">{script?.text}</p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-line p-5">
        {active ? (
          <>
            <LevelMeter level={level} />
            <p className="text-2xl font-semibold tabular-nums" aria-live="off">
              {formatClock(elapsed)}
            </p>
            <ProgressBar value={elapsed / TARGET_S} label="Recording length" className="max-w-xs" />
            <p className="text-[13px] text-muted">
              {elapsed < TARGET_S
                ? `Keep reading — aim for about ${TARGET_S} seconds.`
                : 'That’s plenty. Stop whenever you finish the sentence.'}
            </p>
            <Button
              variant="danger"
              size="lg"
              icon={<Square size={16} fill="currentColor" />}
              onClick={() => void finish(active)}
            >
              Stop recording
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted">
              Use a quiet room, keep the mic about a hand’s width away, and read at your normal
              pace.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                size="lg"
                icon={<Mic size={18} />}
                onClick={() => void start()}
                loading={busy}
              >
                Start recording
              </Button>
              <Button
                size="lg"
                icon={<FileAudio size={18} />}
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                Import a recording
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose an audio file"
                data-testid="voice-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = '';
                }}
              />
            </div>
          </>
        )}
      </div>
      {errorMessage ? <Banner tone="error">{errorMessage}</Banner> : null}
    </div>
  );
}
