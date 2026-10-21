// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the studio voice route in Voice Studio.
 * Scope: The whole wizard against a stateful fake server — choosing the route, the microphone check,
 *   recording takes passage by passage, building (progress, then the results), choosing a voice,
 *   consent and the delivery picker; resuming and discarding a draft; take problems and warnings,
 *   failed saves and imports; microphone errors and the automatic stop; build prerequisites and
 *   outcomes; sessions or voices that could not be created; and the studio profile card.
 * Does NOT belong: The quick route (profiles.test.tsx) or the recorder itself (pcmRecorder.test.ts).
 */
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlFrames,
  json,
  kokoro,
  mockApi,
  nameAndConsent,
  preferences,
  renderWithApp,
  voiceProfile,
  pressDone,
} from '@/test/render';
import {
  CANDIDATES,
  chatterbox,
  job,
  JOB,
  mic,
  openStudio,
  quality,
  recordTake,
  resetMicrophone,
  studioApi,
  studioSession,
  take,
} from '@/test/studio';
import VoiceStudioPage from '../VoiceStudioPage';
import { useTakeRecorder } from './useTakeRecorder';

vi.mock('@/lib/audio/pcmRecorder', async (importOriginal) => {
  const { fakePcmModule } = await import('@/test/studio');
  return fakePcmModule(await importOriginal());
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetMicrophone();
});

/** Renders Voice Studio, continues the draft session and returns the studio wizard. */
async function resumeStudio(user: UserEvent) {
  renderWithApp(<VoiceStudioPage />);
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  return screen.findByRole('dialog', { name: 'Create a studio voice' });
}

describe('Studio voice wizard', () => {
  it('walks a session from the microphone check to a saved, tuned voice', async () => {
    const { calls } = studioApi(null);
    const tick = controlFrames();
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    const dialog = await openStudio(user);
    expect(within(dialog).getByText('Built from your best takes')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));

    await user.selectOptions(await within(dialog).findByLabelText('Microphone'), 'usb');
    await user.click(within(dialog).getByRole('button', { name: 'Check microphone' }));
    await waitFor(() => expect(mic.started).toEqual(['usb']));
    tick(1);
    expect(within(dialog).getByText('Stay quiet for a moment…')).toBeInTheDocument();
    tick(3);
    expect(within(dialog).getByText('Now read the line aloud.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    expect(
      await within(dialog).findByText('The microphone sounds bright or harsh.'),
    ).toBeInTheDocument();
    const panel = within(dialog).getByRole('region', { name: 'Clean up the recording' });
    expect(
      within(panel).getByText(
        'Suggested for this recording: background noise reduced by 50% and treble lowered by 4.5 dB.',
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Using the suggestion' })).toBeDisabled();
    const original = within(panel).getByRole('button', { name: 'Play original' });
    await waitFor(() => expect(original).toBeEnabled());
    await user.click(original);
    await user.click(await within(panel).findByRole('button', { name: 'Stop' }));
    await user.click(within(panel).getByRole('button', { name: 'Play cleaned up' }));
    await within(panel).findByRole('button', { name: 'Play original' }); // the cleaned copy plays
    await user.click(within(panel).getByRole('button', { name: 'Stop' }));
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    expect(await within(dialog).findByText('Foundation passage')).toBeInTheDocument();
    expect(within(dialog).getByText('How to read it (a suggestion):')).toBeInTheDocument();
    expect(within(dialog).getByText(/no need to exaggerate/)).toBeInTheDocument();
    const created = calls.find((c) => c.method === 'POST' && c.path === '/api/voice-sessions');
    expect(JSON.parse(String(created?.body))).toEqual({
      cleanup: { noiseReduction: 0.5, lowCut: false, trebleDb: -4.5, bassDb: 0 },
    });
    expect(within(dialog).getByRole('button', { name: /Continue/ })).toBeDisabled();
    await recordTake(user, dialog, tick);
    expect(await within(dialog).findByText(/Passage 1 of 48/)).toBeInTheDocument();
    const saved = calls.find((c) => c.method === 'PUT' && c.path.endsWith('/takes/49'));
    expect(saved?.query.get('promptId')).toBe('foundation');
    expect(saved?.query.get('text')).toMatch(/^Good morning, and welcome\./);
    await user.click(within(dialog).getByRole('button', { name: 'Previous passage' }));
    expect(await within(dialog).findByText('Recorded · 12 s')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Listen to this take' }));
    expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next passage' }));
    await recordTake(user, dialog, tick);
    expect(await within(dialog).findByText(/You can build your voice now/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    expect(within(dialog).getByText(/measures all 2 usable takes/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Cleanup is on/)).toHaveTextContent(
      'background noise reduced by 50% and treble lowered by 4.5 dB',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Build my voice' }));
    expect(
      await within(dialog).findByText('Listening to your takes (0 of 2)…'),
    ).toBeInTheDocument();
    expect(await within(dialog).findByText('Voice 1', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(dialog).getByText('Best match')).toBeInTheDocument();
    expect(within(dialog).getByText('92% match')).toBeInTheDocument();
    expect(within(dialog).getByText(/Built from “The library opens/)).toBeInTheDocument();
    expect(within(dialog).getByText('Built from imported take 101')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Play sample 1 of voice 1' }));
    expect(
      await within(dialog).findByRole('button', { name: 'Stop sample 1 of voice 1' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop sample 1 of voice 1' }));
    await user.click(within(dialog).getByLabelText(/Voice 2/));

    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    await nameAndConsent(user, dialog, 'Studio me');
    expect(await within(dialog).findByText('“Studio me” is saved')).toBeInTheDocument();
    const finish = calls.find((c) => c.path.endsWith('/finish'));
    expect(JSON.parse(String(finish?.body))).toEqual({
      candidate: 1,
      name: 'Studio me',
      consent: true,
    });
    await user.selectOptions(within(dialog).getByLabelText('Delivery'), 'expressive');
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(within(dialog).getByText(/More rise and fall/)).toBeInTheDocument();
    await pressDone(user, dialog);
  }, 15_000); // the whole wizard, end to end: allow for slow or busy machines

  it('continues or discards a draft session', async () => {
    const draft = studioSession({
      takes: [take(1, 'narration-1'), take(2, 'narration-2')],
      usableSpeechS: 24,
    });
    const { calls } = studioApi(draft);
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText('Studio session in progress')).toBeInTheDocument();
    expect(screen.getByText(/2 takes, 0.4 minutes of usable speech/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a studio voice' });
    expect(await within(dialog).findByText('Foundation passage')).toBeInTheDocument(); // not recorded yet
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard session' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() =>
      expect(screen.queryByText('Studio session in progress')).not.toBeInTheDocument(),
    );
  });

  it('shows take problems, failed saves and import results', async () => {
    const failed = {
      ...take(1, 'narration-1', 2),
      quality: quality(2, [
        { code: 'too_short', severity: 'error', message: 'This take is too short.' },
      ]),
    };
    const draft = studioSession({ takes: [take(49, 'foundation', 40), failed] });
    const tick = controlFrames();
    const { state } = studioApi(draft, {
      'PUT /api/voice-sessions/': () => json({ error: { code: 'payload_too_large', message: 'Too large.' } }, 413),
    }); // prettier-ignore
    const user = userEvent.setup({ applyAccept: false });
    const dialog = await resumeStudio(user);
    expect(await within(dialog).findByText('This take is too short.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Record again' })).toBeInTheDocument();
    await recordTake(user, dialog, tick);
    expect(await within(dialog).findByText('Too large.')).toBeInTheDocument();

    const input = within(dialog).getByTestId('session-import-input');
    await user.upload(input, new File(['x'], 'notes.mp3'));
    expect(within(dialog).getByText('Import a WAV, FLAC or OGG file.')).toBeInTheDocument();
    const huge = new File(['x'], 'long.wav');
    Object.defineProperty(huge, 'size', { value: 700 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(within(dialog).getByText(/larger than 600 MB/)).toBeInTheDocument();
    const imported = studioSession({
      takes: [take(49, 'foundation', 40), failed, take(101, null), take(102, null)],
      usableSpeechS: 24,
    });
    mockApi({
      'GET /api/engines': [kokoro(), chatterbox()],
      'GET /api/voice-sessions/': () => json(state.session),
      'POST /api/voice-sessions/': () => {
        state.session = imported;
        return imported;
      },
    });
    await user.upload(input, new File(['RIFF'], 'session.flac'));
    expect(
      await within(dialog).findByText('Added 2 takes from your recording.'),
    ).toBeInTheDocument();
    expect(await within(dialog).findByText(/Imported takes count/)).toBeInTheDocument();
    mockApi({
      'GET /api/voice-sessions/': () => json(state.session),
      'POST /api/voice-sessions/': () => json({ error: { code: 'take_limit', message: 'Too many takes.' } }, 409),
    }); // prettier-ignore
    await user.upload(input, new File(['RIFF'], 'more.wav'));
    expect(await within(dialog).findByText('Too many takes.')).toBeInTheDocument();
  });

  it('explains microphone problems and stops a take automatically', async () => {
    studioApi(studioSession(), {
      'POST /api/voice-sessions/microphone-check': () => json({ error: { code: 'unsupported_audio', message: 'Bad audio.' } }, 415),
    }); // prettier-ignore
    const tick = controlFrames();
    const user = userEvent.setup();
    const dialog = await resumeStudio(user);
    mic.startError = new DOMException('blocked', 'NotAllowedError');
    await user.click(await within(dialog).findByRole('button', { name: 'Record' }));
    expect(await within(dialog).findByText(/Microphone access was blocked/)).toBeInTheDocument();
    mic.startError = null;
    await user.click(within(dialog).getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument(),
    );
    tick(101); // the foundation passage may run for 100 seconds
    expect(await within(dialog).findByText(/Passage 1 of 48/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    await user.click(within(dialog).getByRole('button', { name: 'Check microphone' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument(),
    );
    tick(170); // the clock kept running from the take above
    expect(await within(dialog).findByText('Bad audio.')).toBeInTheDocument();
  });

  it('needs the cloning engine and reports failed, canceled and refused builds', async () => {
    const ready = studioSession({
      takes: [take(1, 'narration-1'), take(2, 'narration-2')],
      usableSpeechS: 24,
    });
    studioApi(ready, { 'GET /api/engines': [kokoro(), chatterbox('not_installed')] });
    const user = userEvent.setup();
    let dialog = await resumeStudio(user);
    await user.click(await within(dialog).findByRole('button', { name: /Continue/ }));
    expect(
      await within(dialog).findByText('Install the voice-cloning engine to build your voice'),
    ).toBeInTheDocument();
    cleanup();

    const { state } = studioApi(
      { ...ready, candidates: CANDIDATES },
      { 'POST /api/voice-sessions/': () => json({ error: { code: 'not_enough_speech', message: 'Record more first.' } }, 409) },
    ); // prettier-ignore
    state.jobs = [job('failed', 'The engine stopped.')];
    dialog = await resumeStudio(user);
    await user.click(await within(dialog).findByRole('button', { name: /Continue/ }));
    expect(await within(dialog).findByText('Your voice is built')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Build again' }));
    expect(await within(dialog).findByText('Record more first.')).toBeInTheDocument();
  });

  it('shows a failed or canceled build', async () => {
    for (const [status, text] of [['failed', 'The engine stopped.'], ['canceled', 'Build canceled. Your recordings are kept.']] as const) {
      const draft = studioSession({ takes: [take(1, 'narration-1'), take(2, 'narration-2')], usableSpeechS: 24, buildJobId: JOB });
      const { state } = studioApi(draft);
      state.jobs = [job(status, 'The engine stopped.')];
      const user = userEvent.setup();
      const dialog = await resumeStudio(user);
      await user.click(await within(dialog).findByRole('button', { name: /Continue/ }));
      expect(await within(dialog).findByText(text)).toBeInTheDocument();
      cleanup();
    }
  }); // prettier-ignore
});

describe('Studio edge cases', () => {
  it('reports each microphone check verdict and a microphone that would not start', async () => {
    const reports = [
      { report: quality(5), suggested: null },
      {
        report: quality(5, [
          { code: 'no_speech', severity: 'error', message: 'We couldn’t hear you.' },
        ]),
        suggested: null,
      },
      {
        report: quality(5, [{ code: 'thin', severity: 'warning', message: 'Sounds thin.' }]),
        suggested: { noiseReduction: 0, lowCut: false, trebleDb: 0, bassDb: 3 },
      },
    ];
    studioApi(null, {
      'POST /api/voice-sessions/microphone-check': () => reports.shift(),
      'POST /api/voice-profiles/cleanup-preview': () =>
        json({ error: { code: 'unsupported_audio', message: 'Preview failed.' } }, 415),
    });
    const tick = controlFrames();
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    const dialog = await openStudio(user);
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    const microphone = await within(dialog).findByLabelText('Microphone');
    await waitFor(() => expect(microphone).toHaveValue('usb')); // the studio microphone is picked for you
    await user.selectOptions(microphone, '');
    expect(microphone).toHaveValue(''); // and choosing the system default sticks
    mic.startError = new DOMException('missing', 'NotFoundError');
    await user.click(await within(dialog).findByRole('button', { name: 'Check microphone' }));
    expect(await within(dialog).findByText(/No microphone was found/)).toBeInTheDocument();
    mic.startError = null;
    for (const [seconds, verdict] of [
      [9, 'Your microphone sounds good'],
      [18, 'We couldn’t hear you.'],
      [27, 'Sounds thin.'],
    ] as const) {
      await user.click(within(dialog).getByRole('button', { name: /Check (microphone|again)/ }));
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument(),
      );
      tick(seconds);
      expect(await within(dialog).findByText(verdict)).toBeInTheDocument();
    }
    expect(within(dialog).getByText(/low end raised by 3 dB/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Play cleaned up' }));
    expect(await within(dialog).findByText('Preview failed.')).toBeInTheDocument();
    // Changing a setting offers the suggestion again; turning the cleanup off leaves nothing to play.
    await user.click(within(dialog).getByRole('switch', { name: 'Filter out low rumble' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use suggested' }));
    await user.click(within(dialog).getByRole('button', { name: 'Turn cleanup off' }));
    expect(within(dialog).getByRole('button', { name: 'Play cleaned up' })).toBeDisabled();
    within(dialog).getByRole('slider', { name: 'Background noise reduction' }).focus();
    await user.keyboard('{ArrowRight}');
    within(dialog).getByRole('slider', { name: 'Treble' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('5%')).toBeInTheDocument();
    expect(within(dialog).getByText('-0.5 dB')).toBeInTheDocument();
    expect(mic.started).toEqual([undefined, undefined, undefined]);
  });

  it('explains a session or voice that could not be created', async () => {
    studioApi(null, {
      'POST /api/voice-sessions': () => json({ error: { code: 'storage_full', message: 'The disk is full.' } }, 507),
    }); // prettier-ignore
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    const dialog = await openStudio(user);
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    expect(await within(dialog).findByText('The disk is full.')).toBeInTheDocument();
  });

  it('explains a voice that could not be saved', async () => {
    const built = studioSession({ takes: [take(1, 'narration-1'), take(2, 'narration-2')], usableSpeechS: 24, candidates: CANDIDATES });
    studioApi(built, {
      'POST /api/voice-sessions/': () => json({ error: { code: 'voice_limit', message: 'Too many voices.' } }, 409),
    }); // prettier-ignore
    const user = userEvent.setup();
    const dialog = await resumeStudio(user);
    for (let step = 0; step < 3; step += 1)
      await user.click(await within(dialog).findByRole('button', { name: /Continue/ }));
    await nameAndConsent(user, dialog, 'Me');
    expect(await within(dialog).findByText('Too many voices.')).toBeInTheDocument();
  }); // prettier-ignore

  it('shows take warnings and opens the import picker', async () => {
    const warned = {
      ...take(1, 'narration-1'),
      quality: quality(12, [{ code: 'bright', severity: 'warning', message: 'Sounds tinny.' }]),
    };
    studioApi(studioSession({ takes: [take(49, 'foundation', 40), warned], usableSpeechS: 52 }));
    const user = userEvent.setup();
    const dialog = await resumeStudio(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Previous passage' }));
    expect(await within(dialog).findByText('Sounds tinny.')).toBeInTheDocument();
    const input = within(dialog).getByTestId<HTMLInputElement>('session-import-input');
    const picked = vi.spyOn(input, 'click');
    await user.click(within(dialog).getByRole('button', { name: 'Import a recording' }));
    expect(picked).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [] } });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a stop request when nothing is recording', async () => {
    const onClip = vi.fn();
    const { result } = renderHook(() => useTakeRecorder(10, onClip));
    await act(() => result.current.stop());
    expect(onClip).not.toHaveBeenCalled();
  });
});

describe('Studio profiles', () => {
  it('shows a studio voice and changes its delivery, reverting when that fails', async () => {
    const studio = voiceProfile({
      name: 'Studio me',
      kind: 'studio',
      source: 'studio',
      durationS: 700,
    });
    const { calls } = mockApi({
      'GET /api/engines': [kokoro(), chatterbox()],
      'GET /api/preferences': preferences,
      'GET /api/voice-profiles': [studio],
      'GET /api/voice-sessions': [],
      'PATCH /api/voice-profiles/': () =>
        json({ error: { code: 'voice_not_found', message: 'Gone.' } }, 404),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText('Studio')).toBeInTheDocument();
    expect(screen.getByText(/Studio voice · 12 min of recordings/)).toBeInTheDocument();
    const delivery = screen.getByLabelText('Delivery');
    await user.selectOptions(delivery, 'steady');
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    await waitFor(() => expect(delivery).toHaveValue('natural'));
  });
});
