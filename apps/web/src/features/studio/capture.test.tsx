// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for capturing and reviewing a voice reference recording.
 * Scope: CaptureStep with a fake microphone recorder and decoder (jsdom has no audio capture):
 *   permission errors, the live meter and elapsed-time guidance, manual and automatic stop,
 *   processing failures, passage switching, file import limits, and releasing the microphone;
 *   ReviewStep notes, server-check failures and unreadable recordings.
 * Does NOT belong: The full creation wizard (profiles.test.tsx, src/test/flows.test.tsx).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RecorderModule from '@/lib/audio/recorder';
import type * as WavModule from '@/lib/audio/wav';
import { decodeToClip } from '@/lib/audio/wav';
import { controlFrames, json, mockApi, preferences, renderWithApp } from '@/test/render';
import { CaptureStep } from './CaptureStep';
import { NO_CLEANUP } from './cleanup';
import { ReviewStep } from './ReviewSteps';
import { SCRIPTS } from './script';

interface Microphone {
  startError: unknown;
  level: number;
  released: number;
}

const mic = vi.hoisted((): Microphone => ({ startError: null, level: 0.9, released: 0 }));

vi.mock('@/lib/audio/recorder', async (importOriginal) => {
  const actual = await importOriginal<typeof RecorderModule>();
  class FakeRecorder {
    async start() {
      if (mic.startError) throw mic.startError;
    }
    level() {
      return mic.level;
    }
    async stop() {
      return new Blob(['take']);
    }
    release() {
      mic.released += 1;
    }
  }
  return { ...actual, MicRecorder: FakeRecorder };
});

vi.mock('@/lib/audio/wav', async (importOriginal) => {
  const actual = await importOriginal<typeof WavModule>();
  return { ...actual, decodeToClip: vi.fn() };
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(mic, { startError: null, level: 0.9, released: 0 });
});

const clip = (trimmed = false) => ({ samples: new Float32Array(240), sampleRate: 24_000, trimmed });

function renderCapture() {
  const onCaptured = vi.fn();
  const view = render(<CaptureStep onCaptured={onCaptured} />);
  return { user: userEvent.setup(), onCaptured, ...view };
}

describe('CaptureStep recording', () => {
  it('explains a blocked microphone', async () => {
    mic.startError = new DOMException('blocked', 'NotAllowedError');
    const { user } = renderCapture();
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was blocked');
  });

  it('guides the take with elapsed time and a level meter, then stops on request', async () => {
    vi.mocked(decodeToClip).mockResolvedValue(clip());
    const tick = controlFrames();
    const { user, onCaptured, container } = renderCapture();
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(screen.getByRole('button', { name: 'Different passage' })).toBeDisabled();
    tick(5);
    expect(screen.getByText('0:05')).toBeInTheDocument();
    expect(screen.getByText('Keep reading — aim for about 20 seconds.')).toBeInTheDocument();
    expect(container.querySelectorAll('span.bg-danger')).toHaveLength(1); // the loudest lit meter bar
    tick(25);
    expect(screen.getByText('That’s plenty. Stop whenever you finish the sentence.')).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByRole('progressbar', { name: 'Recording length' })).toHaveAttribute('value', '100'); // prettier-ignore
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({ source: 'recording' })),
    );
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  });

  it('stops by itself at the time limit and reports takes it cannot process', async () => {
    vi.mocked(decodeToClip).mockRejectedValue(new Error('bad audio'));
    const tick = controlFrames();
    const { user, onCaptured } = renderCapture();
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    tick(45);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The recording could not be processed.',
    );
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it('releases the microphone when closed mid-take', async () => {
    controlFrames();
    const { user, unmount } = renderCapture();
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    unmount();
    expect(mic.released).toBe(1);
  });
});

describe('CaptureStep passages and imports', () => {
  it('switches between passages', async () => {
    const { user } = renderCapture();
    const passage = (index: number) => screen.getByText(SCRIPTS[index]?.text ?? '');
    expect(passage(0)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Different passage' }));
    expect(passage(1)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Different passage' }));
    expect(passage(0)).toBeInTheDocument();
  });

  it('imports a recording and notes when it was shortened', async () => {
    vi.mocked(decodeToClip).mockResolvedValue(clip(true));
    const { user, onCaptured } = renderCapture();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(screen.getByRole('button', { name: 'Import a recording' }));
    expect(click).toHaveBeenCalled();
    const input = screen.getByTestId('voice-file-input');
    fireEvent.change(input, { target: { files: [] } });
    await user.upload(input, new File(['RIFF'], 'long.wav', { type: 'audio/wav' }));
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'import', note: 'Only the first 45 seconds were kept.' }),
      ),
    );
  });

  it('rejects files that are too large or cannot be decoded', async () => {
    vi.mocked(decodeToClip).mockRejectedValue(new Error('unsupported'));
    const { user } = renderCapture();
    const input = screen.getByTestId('voice-file-input');
    const huge = new File(['x'], 'huge.wav', { type: 'audio/wav' });
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 20 MB');
    await user.upload(input, new File(['??'], 'odd.wav', { type: 'audio/wav' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t decode that file');
  });
});

describe('ReviewStep', () => {
  it('shows the import note, falls back to the instant check and explains a failed server check', async () => {
    mockApi({
      'GET /api/preferences': preferences,
      'POST /api/voice-profiles/analyze': () =>
        json({ error: { code: 'analysis_failed', message: 'The checker crashed.' } }, 500),
    });
    const onVerdict = vi.fn();
    renderWithApp(
      <ReviewStep
        clip={{ ...clip(), source: 'import', note: 'Only the first 45 seconds were kept.' }}
        onRetake={() => undefined}
        onVerdict={onVerdict}
        cleanup={NO_CLEANUP}
        onCleanup={() => undefined}
      />,
    );
    expect(screen.getByText(/· Only the first 45 seconds were kept\./)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('The checker crashed.');
    expect(screen.getByText('instant preview')).toBeInTheDocument();
    expect(onVerdict).toHaveBeenLastCalledWith(false, expect.any(Blob));
  }); // prettier-ignore

  it('still offers the checks when the recording cannot be read back for playback', async () => {
    mockApi({
      'GET /api/preferences': preferences,
      'POST /api/voice-profiles/analyze': () =>
        json({ error: { code: 'analysis_failed', message: 'Not now.' } }, 503),
    });
    const readers: { onerror: (() => void) | null }[] = [];
    vi.stubGlobal(
      'FileReader',
      class {
        error = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          readers.push(this);
        }
      },
    );
    renderWithApp(<ReviewStep clip={{ ...clip(), source: 'recording' }} onRetake={() => undefined} onVerdict={() => undefined} cleanup={NO_CLEANUP} onCleanup={() => undefined} />); // prettier-ignore
    await waitFor(() => expect(readers).toHaveLength(1));
    act(() => readers[0]?.onerror?.());
    expect(screen.getByLabelText('Your recording')).not.toHaveAttribute('src');
    expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument();
  });
});
