// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the audiobook details in the export dialog.
 * Scope: The disclosure starts closed and loads the details only when opened; author, narrator and
 *   description are saved when a field loses focus and, if still unsaved, before the export
 *   starts (never twice for the same values); a cover is checked, uploaded, previewed and removed.
 * Does NOT belong: The export choices and job states (export.test.tsx).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudiobookDetails, JobOut } from '@/api/types';
import { documentDetail, mockApi, preferences, renderWithApp } from '@/test/render';
import { ExportDialog } from './ExportDialog';

afterEach(() => vi.unstubAllGlobals());

const id = 'a'.repeat(32);
const queued: JobOut = {
  id: 'f'.repeat(32), kind: 'export', status: 'queued', progress: 0, message: 'Waiting to start…',
  payload: {}, result: null, errorCode: null, createdAt: '', updatedAt: '',
}; // prettier-ignore

function setup() {
  let details: AudiobookDetails = { author: 'Ann Writer', narrator: null, description: null, hasCover: false }; // prettier-ignore
  const api = mockApi({
    'GET /api/preferences': preferences,
    'POST /api/exports': queued,
    'GET /api/jobs/': queued,
    [`GET /api/documents/${id}/details`]: () => details,
    [`PUT /api/documents/${id}/details`]: (_url: URL, init: RequestInit) =>
      (details = { ...details, ...(JSON.parse(String(init.body)) as AudiobookDetails) }),
    [`PUT /api/documents/${id}/cover`]: () => (details = { ...details, hasCover: true }),
    [`DELETE /api/documents/${id}/cover`]: () => {
      details = { ...details, hasCover: false };
      return new Response(null, { status: 204 });
    },
  });
  renderWithApp(
    <ExportDialog
      open
      onOpenChange={vi.fn()}
      documentId={id}
      sections={documentDetail().sections}
      currentSection={0}
      voiceId="kokoro:af_heart"
      pace={1}
    />,
  );
  return { ...api, user: userEvent.setup() };
}

const detailsPath = `/api/documents/${id}/details`;

describe('Audiobook details', () => {
  it('saves the details on blur and before the export starts, only when they changed', async () => {
    const { calls, user } = setup();
    const toggle = await screen.findByRole('button', { name: /Audiobook details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(calls.some((call) => call.path === detailsPath)).toBe(false);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByLabelText('Author')).toHaveValue('Ann Writer');
    await user.type(screen.getByLabelText('Narrator'), 'Sam Reader');
    await user.tab();
    const saves = () => calls.filter((call) => call.method === 'PUT' && call.path === detailsPath);
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(JSON.parse(String(saves()[0]?.body))).toEqual({
      author: 'Ann Writer',
      narrator: 'Sam Reader',
      description: '',
    });
    await user.click(screen.getByLabelText('Author')); // focus and leave without a change
    await user.tab();
    await user.type(screen.getByLabelText('Description'), 'A quiet story.');
    await user.click(toggle); // closing the disclosure keeps the edit
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    expect(await screen.findByRole('progressbar', { name: 'Export progress' })).toBeInTheDocument();
    expect(saves()).toHaveLength(2);
    expect(JSON.parse(String(saves()[1]?.body))).toMatchObject({ description: 'A quiet story.' });
    const order = calls.map((call) => `${call.method} ${call.path}`);
    expect(order.lastIndexOf(`PUT ${detailsPath}`)).toBeLessThan(
      order.indexOf('POST /api/exports'),
    );
  });

  it('checks, uploads, previews and removes a cover', async () => {
    const { calls } = setup();
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole('button', { name: /Audiobook details/ }));
    const input = await screen.findByLabelText('Choose a cover image');
    await user.upload(input, new File(['GIF89a'], 'cover.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use a JPEG or PNG image for the cover.');
    const huge = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(screen.getByRole('alert')).toHaveTextContent('The cover is larger than 5 MB.');
    expect(calls.some((call) => call.path.endsWith('/cover'))).toBe(false);
    const cover = new File(['png'], 'cover.png', { type: 'image/png' });
    await user.upload(input, cover);
    const preview = await screen.findByRole('img', { name: 'Cover preview' });
    expect(preview.getAttribute('src')).toMatch(new RegExp(`^/api/documents/${id}/cover\\?v=`));
    expect(calls.find((call) => call.method === 'PUT' && call.path.endsWith('/cover'))?.body).toBe(cover); // prettier-ignore
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove cover' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Cover preview' })).not.toBeInTheDocument()); // prettier-ignore
    expect(screen.getByRole('button', { name: 'Choose cover' })).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/cover'))).toBe(
      true,
    );
  });
});
