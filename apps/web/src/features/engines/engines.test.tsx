// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for installing, monitoring and removing speech engines.
 * Scope: Status badges for every engine state, live progress with cancel, install options without a
 *   recommendation, failed installs and failed requests, removal with confirmation, and the default
 *   voices banner shown when Kokoro is missing.
 * Does NOT belong: The install/update happy paths (src/test/flows.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineInfo, JobOut } from '@/api/types';
import { json, kokoro, mockApi, preferences, renderWithApp } from '@/test/render';
import { DefaultVoicesBanner, EnginePanel } from './EngineSetup';

afterEach(() => vi.unstubAllGlobals());

const job = (overrides: Partial<JobOut>): JobOut => ({
  id: 'j'.repeat(32), kind: 'install', status: 'running', progress: 0.2, message: 'Downloading…',
  payload: {}, result: null, errorCode: null, createdAt: '', updatedAt: '', ...overrides,
}); // prettier-ignore

const engine = (overrides: Partial<EngineInfo>) =>
  kokoro({ id: 'chatterbox', name: 'Chatterbox Turbo', device: null, ...overrides });

const base = { 'GET /api/preferences': preferences, 'GET /api/engines': [kokoro()] };

describe('EnginePanel', () => {
  it('labels every engine state', async () => {
    mockApi({
      ...base,
      'GET /api/jobs/u': job({ id: 'u', payload: { update: true }, message: 'Updating runtime' }),
      'GET /api/jobs/i': job({ id: 'i' }),
    });
    renderWithApp(
      <>
        <EnginePanel engine={engine({ status: 'installing', installJobId: 'u' })} />
        <EnginePanel engine={kokoro({ status: 'installing', installJobId: 'i' })} />
        <EnginePanel engine={engine({ id: 'broken', name: 'Broken', status: 'error' })} />
        <EnginePanel engine={engine({ id: 'extra', name: 'Extra', status: 'not_installed', optional: true })} />
        <EnginePanel engine={engine({ id: 'base', name: 'Base', status: 'not_installed' })} />
      </>,
    ); // prettier-ignore
    expect(await screen.findByText('Updating')).toBeInTheDocument();
    expect(
      await screen.findByRole('progressbar', { name: 'Installing Kokoro' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Installing')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('Not installed')).toBeInTheDocument();
    const updating = screen.getByRole('article', { name: 'Chatterbox Turbo' });
    expect(within(updating).getByText('Using 337 MB')).toBeInTheDocument();
  });

  it('cancels a running install', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /api/jobs/': job({}),
      'POST /api/jobs/': job({ status: 'canceled', message: 'Canceled.' }),
    });
    const user = userEvent.setup();
    renderWithApp(<EnginePanel engine={engine({ status: 'installing', installJobId: 'j' })} />);
    expect(
      await screen.findByRole('progressbar', { name: 'Installing Chatterbox Turbo' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path === `/api/jobs/${'j'.repeat(32)}/cancel`)).toBe(true),
    );
  });

  it('explains a failed installation and keeps the install button', async () => {
    mockApi({
      ...base,
      'POST /api/engines/': job({}),
      'GET /api/jobs/': job({ status: 'failed', message: 'The download was interrupted.' }),
    });
    const user = userEvent.setup();
    renderWithApp(
      <EnginePanel engine={engine({ status: 'not_installed', installOptions: [], installedBytes: 0 })} />,
    ); // prettier-ignore
    expect(screen.getByText('Needs about 0 B of disk space')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install Chatterbox Turbo (0 B)' }));
    const failed = await screen.findByText('Installation failed');
    expect(failed.closest('[role="alert"]')).toHaveTextContent('The download was interrupted.');
    expect(await screen.findByText('Chatterbox Turbo install failed')).toBeInTheDocument();
  });

  it('shows why an install could not start and defaults to the first option', async () => {
    const { calls } = mockApi({
      ...base,
      'POST /api/engines/': json({ error: { code: 'offline', message: 'No connection.' } }, 503),
    });
    const user = userEvent.setup();
    const options = [
      { id: 'gpu', label: 'GPU', description: '', downloadBytes: 2e9, diskBytes: 3e9, recommended: false },
      { id: 'cpu', label: 'CPU', description: '', downloadBytes: 1e9, diskBytes: 2e9, recommended: false },
    ]; // prettier-ignore
    renderWithApp(
      <EnginePanel engine={engine({ status: 'not_installed', installOptions: options })} />,
    );
    expect(screen.getByRole('radio', { name: /GPU/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /Install Chatterbox Turbo/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection.');
    expect(calls.find((call) => call.method === 'POST')?.body).toBe('{"option":"gpu"}');
  });

  it('removes an installed engine after confirmation', async () => {
    const { calls } = mockApi({
      ...base,
      'DELETE /api/engines/': new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderWithApp(<EnginePanel engine={engine({ device: 'cuda' })} />);
    expect(screen.getByText('Using 337 MB · running on CUDA')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Chatterbox Turbo?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'DELETE')?.path).toBe('/api/engines/chatterbox');
  });
});

describe('DefaultVoicesBanner', () => {
  it('asks for the voice model only when Kokoro is known and not ready', async () => {
    mockApi({ ...base, 'GET /api/engines': [kokoro({ status: 'not_installed' })] });
    renderWithApp(<DefaultVoicesBanner />);
    expect(
      await screen.findByText('Install the voice model to start listening'),
    ).toBeInTheDocument();
  });

  it('stays hidden when the server lists no Kokoro engine', async () => {
    const { fetchMock } = mockApi({ ...base, 'GET /api/engines': [] });
    const { container } = renderWithApp(<DefaultVoicesBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).not.toHaveTextContent('Install the voice model');
  });
});
