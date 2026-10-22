// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the take recorder hook's microphone problems.
 * Scope: A take with no sound is never handed over; a microphone unplugged mid-take drops the take and
 *   says so; a good take is handed over; each problem comes with a hint.
 * Does NOT belong: Capturing audio (lib/audio/pcmRecorder.test.ts) or the recorder's screens.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTakeRecorder } from './useTakeRecorder';

const fake = vi.hoisted(() => ({
  samples: new Float32Array(0),
  unplug: undefined as (() => void) | undefined,
  released: 0,
}));

vi.mock('@/lib/audio/pcmRecorder', () => ({
  PcmRecorder: class {
    async start(_deviceId?: string, onEnded?: () => void) {
      fake.unplug = onEnded;
    }
    async stop() {
      return { samples: fake.samples, sampleRate: 48_000 };
    }
    release() {
      fake.released += 1;
    }
    level() {
      return 0.5;
    }
  },
}));

async function recording(samples: Float32Array<ArrayBuffer>) {
  fake.samples = samples;
  const onClip = vi.fn();
  const hook = renderHook(() => useTakeRecorder(45, onClip));
  await act(() => hook.result.current.start(undefined));
  return { hook, onClip };
}

describe('useTakeRecorder', () => {
  it('hands over a take with sound', async () => {
    const { hook, onClip } = await recording(new Float32Array([0.1, -0.2]));
    await act(() => hook.result.current.stop());
    expect(onClip).toHaveBeenCalledWith({
      samples: new Float32Array([0.1, -0.2]),
      sampleRate: 48_000,
    });
    expect(hook.result.current.error).toBeNull();
  });

  it('keeps a take without any sound, or with damaged samples, from being uploaded', async () => {
    for (const samples of [new Float32Array(0), new Float32Array([0.1, Number.NaN])]) {
      const { hook, onClip } = await recording(samples);
      await act(() => hook.result.current.stop());
      expect(onClip).not.toHaveBeenCalled();
      expect(hook.result.current.error).toMatchObject({
        code: 'empty',
        message: 'Nothing was recorded.',
      });
      expect(hook.result.current.error?.hint).toMatch(/isn’t muted/);
    }
  });

  it('drops the take and explains when the microphone is unplugged mid-take', async () => {
    const { hook, onClip } = await recording(new Float32Array([0.1]));
    const before = fake.released;
    act(() => fake.unplug?.());
    expect(hook.result.current.recording).toBe(false);
    expect(hook.result.current.error?.code).toBe('disconnected');
    expect(hook.result.current.error?.hint).toMatch(/Reconnect it/);
    expect(fake.released).toBe(before + 1);
    await act(() => hook.result.current.stop()); // nothing left to stop
    expect(onClip).not.toHaveBeenCalled();
  });
});
