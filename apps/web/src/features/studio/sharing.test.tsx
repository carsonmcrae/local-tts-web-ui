// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for sharing and importing voices, and for improving a studio voice's expression.
 * Scope: Sharing downloads only after the owner confirms; importing checks the file type and size,
 *   needs consent and sends an optional new name; a studio voice that kept its takes offers to
 *   build its speaking styles and lists them; a shared voice shows its badge.
 * Does NOT belong: Creating voices (profiles.test.tsx, session tests).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { JobOut } from '@/api/types';
import { kokoro, mockApi, preferences, renderWithApp, voiceProfile } from '@/test/render';
import { chatterbox } from '@/test/studio';
import VoiceStudioPage from './VoiceStudioPage';

const JOB_ID = 'e'.repeat(32);
const stylesJob = (status: JobOut['status']): JobOut => ({
  id: JOB_ID, kind: 'voice-styles', status, progress: 0.5, message: 'Teaching the voice…', payload: {}, result: null,
  errorCode: null, createdAt: '2026-10-20T10:00:00+00:00', updatedAt: '2026-10-20T10:00:00+00:00',
}); // prettier-ignore

function studioPage(profiles: unknown[], routes: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro(), chatterbox()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [],
    'GET /api/voice-profiles': profiles,
    'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
    'GET /api/voice-sessions': [],
    ...routes,
  });
}

describe('Voice sharing', () => {
  it('downloads a voice file only after the owner confirms', async () => {
    studioPage([voiceProfile({ name: 'Me' })]);
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share “Me”' });
    expect(within(dialog).getByText(/Anyone with this file/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download voice file' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    const link = within(dialog).getByRole('link', { name: 'Download voice file' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/export?confirm=true'));
    await user.click(link);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('imports a shared voice with the importer’s consent and an optional name', async () => {
    const { calls } = studioPage([], {
      'POST /api/voice-profiles/import': voiceProfile({ name: 'From Sam', source: 'shared' }),
    });
    const user = userEvent.setup({ applyAccept: false });
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Import a voice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a voice' });
    const input = within(dialog).getByTestId('voice-import-input');
    await user.upload(input, new File(['x'], 'voice.zip'));
    expect(within(dialog).getByText('Choose a .ttsvoice file.')).toBeInTheDocument();
    const huge = new File(['x'], 'big.ttsvoice');
    Object.defineProperty(huge, 'size', { value: 41 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(within(dialog).getByText('That file is larger than 40 MB.')).toBeInTheDocument();
    await user.upload(input, new File(['PK'], 'sam.ttsvoice'));
    expect(within(dialog).getByText('sam.ttsvoice')).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Import voice' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Name/), 'From Sam');
    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.find((call) => call.path === '/api/voice-profiles/import');
    expect(sent?.query.get('consent')).toBe('true');
    expect(sent?.query.get('name')).toBe('From Sam');
  });

  it('shows why an import was refused', async () => {
    studioPage([], {
      'POST /api/voice-profiles/import': () =>
        new Response(
          JSON.stringify({ error: { code: 'invalid_voice_file', message: 'Not a voice.' } }),
          {
            status: 415,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Import a voice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a voice' });
    await user.upload(
      within(dialog).getByTestId('voice-import-input'),
      new File(['x'], 'a.ttsvoice'),
    );
    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Import voice' }));
    expect(await within(dialog).findByText('Not a voice.')).toBeInTheDocument();
  });
});

describe('Voice expression', () => {
  it('builds the speaking styles of a studio voice that kept its takes', async () => {
    const studio = voiceProfile({
      name: 'Studio me',
      kind: 'studio',
      source: 'studio',
      canRefine: true,
    });
    const { calls } = studioPage([studio], {
      'POST /api/voice-profiles/': stylesJob('running'),
      'GET /api/jobs/': stylesJob('succeeded'),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText(/reads every sentence the same way/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Improve expression' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/styles'))).toBe(true));
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/api/voice-profiles').length).toBeGreaterThan(1),
    );
  });

  it('lists the styles a voice has, and marks a shared voice', async () => {
    studioPage([
      voiceProfile({ kind: 'studio', source: 'shared', styles: ['narration', 'question'] }),
    ]);
    renderWithApp(<VoiceStudioPage />);
    expect(
      await screen.findByText(/Reads narration, questions in your own style/),
    ).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expression/ })).not.toBeInTheDocument();
  });
});
