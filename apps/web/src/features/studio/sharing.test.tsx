// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for sharing and importing voices, and for improving a studio voice's expression.
 * Scope: Sharing downloads only after the owner confirms (Escape just closes); importing opens the
 *   file chooser, checks the file type and size, shows what the file says about itself (little, for
 *   an old one), needs consent, sends an optional new name, and explains a refusal; a studio voice
 *   that kept its takes offers to build its speaking styles (shown while they build, with failures and
 *   refusals explained) and lists them, naming unknown styles as the server does; a voice whose takes
 *   are gone only offers its previous expression; a shared voice shows its badge.
 * Does NOT belong: Creating voices (profiles.test.tsx, session tests).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JobOut, VoiceProfile } from '@/api/types';
import { json, kokoro, mockApi, preferences, renderWithApp, voiceProfile } from '@/test/render';
import { chatterbox } from '@/test/studio';
import VoiceStudioPage from './VoiceStudioPage';

const PREVIEW = {
  name: 'Sam', description: 'Warm and calm', creator: 'Sam K.', kind: 'studio', delivery: 'expressive',
  durationS: 12, styles: ['question', 'calm', 'whisper'], sizeBytes: 2_400_000, consentStatement: 'I may share it.',
  consentedAt: '2026-10-01T00:00:00+00:00', createdAt: '2026-10-01T00:00:00+00:00',
  exportedAt: '2026-10-02T00:00:00+00:00', appVersion: '2.0.0', formatVersion: 1, humanVoice: true,
}; // prettier-ignore

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
    await user.keyboard('{Escape}'); // thought better of it
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Share' }));
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
      'POST /api/voice-profiles/import/preview': PREVIEW,
    });
    const user = userEvent.setup({ applyAccept: false });
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Import a voice' }));
    await user.keyboard('{Escape}'); // not now
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Import a voice' }));
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
    const shown = await within(dialog).findByRole('region', { name: 'Voice file' });
    expect(shown).toHaveTextContent('Sam');
    expect(shown).toHaveTextContent('By Sam K.');
    expect(shown).toHaveTextContent('Studio voice · 2.4 MB');
    expect(shown).toHaveTextContent('Speaking styles: questions, calm lines, whisper'); // the last is unknown here
    expect(shown).toHaveTextContent('This is a copy of a real person’s voice');
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

  it('shows why a voice file was refused before anything is imported', async () => {
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
    expect(await within(dialog).findByText('Not a voice.')).toBeInTheDocument(); // from the check
    await user.click(await within(dialog).findByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: 'Import voice' })).toBeDisabled();
    expect(within(dialog).queryByRole('region', { name: 'Voice file' })).not.toBeInTheDocument();
  });

  it('shows what little an old voice file says, and imports it under its own name after a refusal', async () => {
    const sparse = {
      ...PREVIEW, name: 'Old', description: null, creator: null, kind: 'quick', styles: [],
      createdAt: null, exportedAt: 'some day', appVersion: null,
    }; // prettier-ignore
    let refusals = 1;
    const { calls } = studioPage([], {
      'POST /api/voice-profiles/import/preview': sparse,
      'POST /api/voice-profiles/import': () =>
        refusals-- > 0
          ? json({ error: { code: 'refused', message: 'The voice could not be saved.' } }, 507)
          : voiceProfile({ name: 'Old', source: 'shared' }),
    });
    const user = userEvent.setup({ applyAccept: false });
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Import a voice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a voice' });
    const input = within(dialog).getByTestId('voice-import-input');
    const opened = vi.fn();
    input.addEventListener('click', opened);
    await user.click(within(dialog).getByRole('button', { name: 'Choose file' }));
    expect(opened).toHaveBeenCalledOnce(); // the file chooser
    fireEvent.change(input, { target: { files: [] } }); // and it was cancelled
    expect(within(dialog).getByText('No file chosen')).toBeInTheDocument();
    await user.upload(input, new File(['PK'], 'old.ttsvoice'));
    const shown = await within(dialog).findByRole('region', { name: 'Voice file' });
    expect(within(shown).getByText('Quick voice · 2.4 MB')).toBeInTheDocument(); // and no more
    expect(shown).not.toHaveTextContent('Speaking styles');
    expect(shown).not.toHaveTextContent('By ');
    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Import voice' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The voice could not be saved.'); // prettier-ignore
    await user.click(within(dialog).getByRole('button', { name: 'Import voice' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.filter((call) => call.path === '/api/voice-profiles/import');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.query.has('name')).toBe(false); // keeps the name it was shared with
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

  it('switches back to the expression a voice had before its last rebuild', async () => {
    const studio = voiceProfile({
      kind: 'studio', source: 'studio', canRefine: true, hasPreviousStyles: true, styles: ['question'],
    }); // prettier-ignore
    const { calls } = studioPage([studio], {
      'POST /api/voice-profiles/': { ...studio, styles: [], hasPreviousStyles: true },
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Switch to the previous expression' }),
    );
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/styles/restore'))).toBe(true),
    );
  });

  it('shows the improvement while it runs, and says when it fails', async () => {
    const studio = voiceProfile({ kind: 'studio', source: 'studio', canRefine: true });
    const jobs = [stylesJob('running'), { ...stylesJob('failed'), message: 'The takes were too short.' }]; // prettier-ignore
    studioPage([studio], {
      'POST /api/voice-profiles/': stylesJob('running'),
      'GET /api/jobs/': () => (jobs.length > 1 ? jobs.shift() : jobs[0]),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Improve expression' }));
    expect(
      await screen.findByRole('progressbar', { name: 'Improving expression' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'The takes were too short.',
    );
  });

  it('offers only the previous expression once the takes are gone, and explains refusals', async () => {
    // One voice answered without styles at all (an older server), one that only has its previous ones.
    const legacy: Partial<VoiceProfile> = voiceProfile({ kind: 'studio', source: 'studio', canRefine: true, name: 'Legacy' }); // prettier-ignore
    delete legacy.styles;
    const settled = voiceProfile({ kind: 'studio', source: 'studio', canRefine: false, hasPreviousStyles: true, styles: ['calm'], name: 'Settled' }); // prettier-ignore
    studioPage([legacy, settled], {
      'POST /api/voice-profiles/': (url: URL) =>
        json({ error: { code: 'refused', message: `Refused: ${url.pathname.split('/').pop() ?? ''}.` } }, 409), // prettier-ignore
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText(/Reads calm in your own style/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rebuild expression' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to the previous expression' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refused: restore.');
    await user.click(screen.getByRole('button', { name: 'Improve expression' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('Refused: styles.'); // prettier-ignore
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
