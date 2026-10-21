// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Exports page on a phone or tablet paired in LAN mode.
 * Scope: Cancelling, deleting and sending to Audiobookshelf are refused to paired devices, so their
 *   buttons aren't offered there, while Download and Resume are; a stale export says to cancel it
 *   on the computer.
 * Does NOT belong: The Exports page on this computer (exports.test.tsx) or LAN policy (the server).
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExportOut, JobOut } from '@/api/types';
import { mockApi, renderWithApp } from '@/test/render';
import ExportsPage from './ExportsPage';

vi.mock('@/features/lan/LanIndicator', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  onThisComputer: () => false,
}));

const job = (overrides: Partial<JobOut>): JobOut => ({
  id: 'a'.repeat(32), kind: 'export', status: 'succeeded', progress: 1, message: 'Done', payload: {}, result: null,
  errorCode: null, createdAt: '2026-10-01T10:00:00+00:00', updatedAt: '2026-10-01T10:00:00+00:00', ...overrides,
}); // prettier-ignore

const item = (overrides: Partial<ExportOut> & { job: JobOut }): ExportOut => ({
  title: 'The Lighthouse', format: 'mp3', sentences: 400, savedSentences: 0, workingBytes: 0, queuePosition: null,
  stale: false, ...overrides,
}); // prettier-ignore

describe('Exports on a paired phone', () => {
  it('offers only what a phone may do', async () => {
    mockApi({
      'GET /api/exports': [
        item({ job: job({ result: { filename: 'The Lighthouse.mp3', sizeBytes: 3e7, durationS: 3600 } }), workingBytes: 3e7 }), // prettier-ignore
        item({
          job: job({ id: 'b'.repeat(32), status: 'paused', progress: 0.3, message: 'Paused' }),
          title: 'Old book', savedSentences: 120, workingBytes: 5_000_000, stale: true,
        }),
        item({
          job: job({ id: 'c'.repeat(32), status: 'running', progress: 0.5, message: 'Generated 4 of 8' }),
          title: 'New book', savedSentences: 4, sentences: 8,
        }),
      ],
      'GET /api/integrations/audiobookshelf': { configured: true, hasKey: true, url: 'http://shelf', libraryId: 'l', folderId: 'f' }, // prettier-ignore
    }); // prettier-ignore
    renderWithApp(<ExportsPage />);
    expect(await screen.findByRole('link', { name: /Download/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete file/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel export/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Send to Audiobookshelf/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/or cancel it on the computer to free the space/)).toBeInTheDocument();
  });
});
