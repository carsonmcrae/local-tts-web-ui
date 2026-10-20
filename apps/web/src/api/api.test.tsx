// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Edge cases of the API client and the query hooks that screens rarely reach.
 * Scope: Error bodies without an error object, aborted requests, unreadable audio headers, plain
 *   errors, disabled queries without ids, engine-install polling and installs without an option.
 * Does NOT belong: The common request/response paths (lib.test.ts) or screen behaviour.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/App';
import { json, kokoro, mockApi } from '@/test/render';
import { api, describeError, prepareAudio } from './client';
import { useDocument, useEngines, useInstallEngine, useSection } from './queries';

afterEach(() => vi.unstubAllGlobals());

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('api client edge cases', () => {
  it('reports an HTTP error when the JSON body has no error object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ detail: 'nope' }, 409)),
    );
    await expect(api('/api/x')).rejects.toMatchObject({
      code: 'http_error',
      message: 'The server answered 409.',
    });
  });

  it('lets aborted requests through unchanged', async () => {
    const abort = new DOMException('stopped', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(abort)),
    );
    await expect(api('/api/x')).rejects.toBe(abort);
  });

  it('treats an unreadable duration as zero and tolerates a failed body cancel', async () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'X-Audio-Duration': 'soon' }),
      body: { cancel: () => Promise.reject(new Error('already closed')) },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    await expect(prepareAudio('/api/a')).resolves.toEqual({ url: '/api/a', duration: 0 });
  });

  it('describes plain errors by their message', () => {
    expect(describeError(new Error('Disk full.'))).toBe('Disk full.');
  });
});

describe('query hooks', () => {
  it('stays idle without a document id or section index', () => {
    const { fetchMock } = mockApi({});
    const document = renderHook(() => useDocument(undefined), { wrapper });
    const section = renderHook(() => useSection(undefined, undefined), { wrapper });
    expect(document.result.current.fetchStatus).toBe('idle');
    expect(section.result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls engines while one is installing', async () => {
    let calls = 0;
    mockApi({
      'GET /api/engines': () => [kokoro({ status: ++calls < 2 ? 'installing' : 'ready' })],
    });
    const { result } = renderHook(() => useEngines(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('installing'));
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('ready'), {
      timeout: 3000,
    });
  });

  it('installs the default option when none is chosen', async () => {
    const { calls } = mockApi({ 'POST /api/engines/': { id: 'j' } });
    const { result } = renderHook(() => useInstallEngine(), { wrapper });
    await act(() => result.current.mutateAsync({ engineId: 'kokoro', option: undefined }));
    expect(calls[0]?.body).toBe('{"option":null}');
  });
});
