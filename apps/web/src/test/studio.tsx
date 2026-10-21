// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Shared fixtures for the studio voice tests.
 * Scope: A fake lossless recorder (its microphone state lives in `mic`), session, take, job and
 *   candidate fixtures, a small stateful fake server for one studio session, and helpers that open
 *   the studio wizard and record a take.
 * Does NOT belong: Test cases (features/studio/session/*.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import type { JobOut, SessionTake, VoiceSession } from '@/api/types';
import type * as PcmModule from '@/lib/audio/pcmRecorder';
import { json, kokoro, mockApi, preferences, voice, voiceProfile } from './render';

/** What the fake microphone does next, and which inputs were opened. */
export const mic: { startError: unknown; started: (string | undefined)[] } = {
  startError: null,
  started: [],
};

export function resetMicrophone() {
  Object.assign(mic, { startError: null, started: [] });
}

/** The pcmRecorder module with a fake recorder and one USB input (for `vi.mock`). */
export function fakePcmModule(actual: typeof PcmModule): typeof PcmModule {
  class FakePcmRecorder {
    async start(deviceId?: string) {
      if (mic.startError) throw mic.startError;
      mic.started.push(deviceId);
    }
    level() {
      return 0.6;
    }
    async stop() {
      return { samples: new Float32Array(480), sampleRate: 48_000 };
    }
    release() {}
  }
  return {
    ...actual,
    PcmRecorder: FakePcmRecorder as unknown as typeof PcmModule.PcmRecorder,
    listInputs: async () => [{ deviceId: 'usb', label: 'USB Mic' }],
  };
}

const ID = 'd'.repeat(32);
export const JOB = 'e'.repeat(32);
export const chatterbox = (status: 'ready' | 'not_installed' = 'ready') =>
  kokoro({
    id: 'chatterbox',
    name: 'Chatterbox Turbo',
    supportsCloning: true,
    optional: true,
    status,
  });

export const quality = (speechS: number, issues: SessionTake['quality']['issues'] = []) => ({
  durationS: speechS, speechS, rmsDbfs: -20, peakDbfs: -3, clippingRatio: 0, pauseRatio: 0.1, snrDb: 40,
  brightnessDb: -6, ok: !issues.some((issue) => issue.severity === 'error'), issues,
}); // prettier-ignore

export const take = (number: number, promptId: string | null, speechS = 12): SessionTake => ({
  number, promptId, source: promptId ? 'recording' : 'import', durationS: speechS, quality: quality(speechS),
  createdAt: '2026-10-20T10:00:00+00:00',
}); // prettier-ignore

const STYLES = ['narration', 'question', 'lively', 'dialogue', 'calm'];

export const studioSession = (overrides: Partial<VoiceSession> = {}): VoiceSession => {
  const complete = (overrides.usableSpeechS ?? 0) >= (overrides.requiredSpeechS ?? 20);
  return {
    id: ID, takes: [], usableSpeechS: 0, requiredSpeechS: 20, minimumSpeechS: 45, canBuild: complete, complete,
    tier: complete ? 'complete' : 'starting', styles: STYLES.map((style) => ({ style, takes: 0 })),
    candidates: [], buildJobId: null, cleanup: null, createdAt: '2026-10-20T10:00:00+00:00',
    updatedAt: '2026-10-20T10:00:00+00:00', ...overrides,
  };
}; // prettier-ignore

export const job = (status: JobOut['status'], message = ''): JobOut => ({
  id: JOB, kind: 'voice-build', status, progress: 0.4, message, payload: { sessionId: ID }, result: null,
  errorCode: null, createdAt: '2026-10-20T10:00:00+00:00', updatedAt: '2026-10-20T10:00:00+00:00',
}); // prettier-ignore

export const CANDIDATES = [
  { index: 0, takeNumber: 1, promptId: 'narration-1', similarity: 0.92, samples: 2 },
  { index: 1, takeNumber: 101, promptId: null, similarity: 0.9, samples: 2 },
];

/** A small stateful server for one studio session. */
export function studioApi(initial: VoiceSession | null, overrides: Record<string, unknown> = {}) {
  const state = {
    session: initial,
    jobs: [job('running', 'Listening to your takes (0 of 2)…'), job('succeeded')],
  };
  const sessionOr404 = () =>
    state.session
      ? json(state.session)
      : json({ error: { code: 'session_not_found', message: 'Gone.' } }, 404);
  const saveTake = (url: URL) => {
    const session = state.session ?? studioSession();
    const number = Number(url.pathname.split('/').at(-1));
    const saved = take(number, url.searchParams.get('promptId'));
    const takes = [...session.takes.filter((item) => item.number !== number), saved];
    const usableSpeechS = takes.length * 12;
    const complete = usableSpeechS >= session.requiredSpeechS;
    state.session = { ...session, takes, usableSpeechS, complete, canBuild: complete };
    return saved;
  };
  const post = (url: URL) => {
    if (url.pathname.endsWith('/build')) return state.jobs[0];
    if (url.pathname.endsWith('/finish'))
      return voiceProfile({ name: 'Studio me', kind: 'studio', source: 'studio' });
    return json({ error: { code: 'not_mocked', message: url.pathname } }, 404);
  };
  const nextJob = () => {
    const current = state.jobs.length > 1 ? state.jobs.shift() : state.jobs[0];
    if (current?.status === 'succeeded' && state.session)
      state.session = { ...state.session, candidates: CANDIDATES };
    return current;
  };
  const api = mockApi({
    'GET /api/engines': [kokoro(), chatterbox()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    'GET /api/voice-profiles': [],
    'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
    'GET /api/voice-sessions': () => (state.session ? [state.session] : []),
    'GET /api/voice-sessions/': sessionOr404,
    'POST /api/voice-sessions': (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { cleanup: VoiceSession['cleanup'] };
      state.session = studioSession({ cleanup: body.cleanup });
      return json(state.session, 201);
    },
    'POST /api/voice-sessions/microphone-check': {
      report: quality(5, [
        { code: 'bright', severity: 'warning', message: 'The microphone sounds bright or harsh.' },
      ]),
      suggested: { noiseReduction: 0.5, lowCut: false, trebleDb: -4.5, bassDb: 0 },
    },
    'POST /api/voice-profiles/cleanup-preview': () => new Response(new Blob(['cleaned'])),
    'PUT /api/voice-sessions/': saveTake,
    'POST /api/voice-sessions/': post,
    'GET /api/jobs/': nextJob,
    'PATCH /api/voice-profiles/': (_url: URL, init: RequestInit) => voiceProfile({ ...JSON.parse(String(init.body)) }),
    'DELETE /api/voice-sessions/': () => {
      state.session = null;
      return new Response(null, { status: 204 });
    },
    ...overrides,
  }); // prettier-ignore
  return { state, ...api };
}

export async function openStudio(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Create voice' }));
  const chooser = await screen.findByRole('dialog', { name: 'Create a voice' });
  await user.click(within(chooser).getByRole('button', { name: /Studio voice/ }));
  return screen.findByRole('dialog', { name: 'Create a studio voice' });
}

export async function recordTake(
  user: UserEvent,
  dialog: HTMLElement,
  tick: (seconds: number) => void,
) {
  await user.click(within(dialog).getByRole('button', { name: /^Record/ }));
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument(),
  );
  tick(3);
  await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
}
