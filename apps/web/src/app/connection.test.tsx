// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for getting through a lost connection, and for the service worker's registration.
 * Scope: The "Reconnecting…" banner (a polite live region) after a request finds no server, its
 *   growing waits, the explanation and "Retry now", and that it goes away and refreshes data once
 *   the server answers; a page whose code couldn't be fetched (or that failed) explained, with a
 *   Retry that loads it again; registering the service worker only in production builds on secure
 *   pages where browsers support it, with the app version in its URL.
 * Does NOT belong: The service worker's caching itself (public/sw.js runs only in a browser).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportServerReachable } from '@/api/connection';
import { json, mockApi, renderWithApp } from '@/test/render';
import { ConnectionBanner } from './ConnectionBanner';
import { PageError } from './PageError';
import { registerServiceWorker } from './serviceWorker';

afterEach(() => {
  act(() => reportServerReachable(true));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The server as the shell's own requests (preferences) and the banner's checks (health) see it. */
function server(answer: () => Response | null) {
  const reply = () => {
    const response = answer();
    if (!response) throw new TypeError('Failed to fetch');
    return response;
  };
  const api = mockApi({ 'GET /api/health': reply, 'GET /api/preferences': reply });
  const view = renderWithApp(<ConnectionBanner />);
  const checks = () => api.calls.filter((call) => call.path === '/api/health').length;
  return { ...view, checks, region: screen.getByRole('status', { name: 'Connection' }) };
}

describe('Reconnect banner', () => {
  it('retries with growing waits, explains, and goes away once the server answers', async () => {
    vi.useFakeTimers();
    let up = false;
    const { checks, region, queryClient } = server(() => (up ? json({ status: 'ok' }) : null));
    const refresh = vi.spyOn(queryClient, 'invalidateQueries');
    await act(() => vi.advanceTimersByTimeAsync(0)); // the shell's first request finds no server
    expect(region).toHaveTextContent('Reconnecting…');
    expect(region).not.toHaveTextContent("isn't reachable");
    expect(checks()).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(checks()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(checks()).toBe(1); // the second wait is longer
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(checks()).toBe(2);
    expect(region).toHaveTextContent(
      "Reconnecting… TTSNative isn't reachable. Is the computer on and the app running?",
    );

    up = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(checks()).toBe(3);
    expect(region).toBeEmptyDOMElement();
    expect(refresh).toHaveBeenCalled();
  });

  it('counts any answer, even a refusal, as being back', async () => {
    vi.useFakeTimers();
    let starting = false;
    const { region } = server(() =>
      starting ? json({ error: { code: 'starting', message: 'Starting.' } }, 503) : null,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(region).toHaveTextContent('Reconnecting…');
    starting = true;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(region).toBeEmptyDOMElement();
  });

  it('is empty while the server answers', () => {
    const { region } = server(() => json({ status: 'ok' }));
    act(() => reportServerReachable(true));
    expect(region).toBeEmptyDOMElement();
  });
});

describe('A page that fails', () => {
  function failWith(error: Error) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // React reports the error
    const Broken = (): never => {
      throw error;
    };
    const router = createMemoryRouter(
      [{ path: '/voices', element: <Broken />, errorElement: <PageError /> }],
      { initialEntries: ['/voices?tab=mine'] },
    );
    render(<RouterProvider router={router} />);
  }

  it('explains a part of the app that could not be fetched, and retries with a full load', () => {
    failWith(new TypeError('Failed to fetch dynamically imported module: /assets/Voices-1.js'));
    expect(screen.getByRole('heading', { name: "This page couldn't load" })).toBeInTheDocument();
    expect(screen.getByText(/TTSNative isn.t reachable — is the computer on and the app running\?/)).toBeInTheDocument(); // prettier-ignore
    expect(screen.getByRole('link', { name: 'Retry' })).toHaveAttribute('href', '/voices?tab=mine');
  });

  it('shows any other failure as it is', () => {
    failWith(new Error('Something broke.'));
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Something broke.')).toBeInTheDocument();
  });
});

describe('Service worker registration', () => {
  const container = () => ({ register: vi.fn(async () => ({}) as ServiceWorkerRegistration) });

  it('is skipped in development and tests, on insecure pages and without support', async () => {
    const browser = container();
    await expect(registerServiceWorker({ production: false, secure: true, container: browser })).resolves.toBe(false); // prettier-ignore
    await expect(registerServiceWorker({ production: true, secure: false, container: browser })).resolves.toBe(false); // prettier-ignore
    await expect(registerServiceWorker({ production: true, secure: true, container: undefined })).resolves.toBe(false); // prettier-ignore
    await expect(registerServiceWorker()).resolves.toBe(false); // this test run: not a production build
    expect(browser.register).not.toHaveBeenCalled();
  });

  it('registers the versioned worker on a secure production page, and shrugs off a refusal', async () => {
    const browser = container();
    await expect(registerServiceWorker({ production: true, secure: true, container: browser })).resolves.toBe(true); // prettier-ignore
    expect(browser.register).toHaveBeenCalledWith('/sw.js?v=test', { scope: '/' });
    browser.register.mockRejectedValueOnce(new DOMException('blocked', 'SecurityError'));
    await expect(registerServiceWorker({ production: true, secure: true, container: browser })).resolves.toBe(false); // prettier-ignore
  });

  it("uses the browser's own service workers, and a placeholder version outside a build", async () => {
    const browser = container();
    Object.defineProperty(navigator, 'serviceWorker', { value: browser, configurable: true });
    vi.stubGlobal('__APP_VERSION__', undefined);
    try {
      await expect(registerServiceWorker({ production: true, secure: true })).resolves.toBe(true);
      expect(browser.register).toHaveBeenCalledWith('/sw.js?v=dev', { scope: '/' });
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });
});
