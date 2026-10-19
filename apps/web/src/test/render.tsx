/**
 * Purpose: Test harness for rendering screens with the app's real providers.
 * Scope: A route-table API mock for `fetch` (matched by method and path prefix), sample API objects,
 *   and `renderWithApp` that mounts the component inside QueryClient, Toast and Player providers and
 *   a memory router.
 * Does NOT belong: Assertions or per-test data beyond shared fixtures.
 */
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { DocumentDetail, EngineInfo, Preferences, VoiceInfo } from '@/api/types';
import { createQueryClient } from '@/app/App';
import { ToastProvider } from '@/components/ui/Toast';
import type { MediaLike } from '@/features/player/controller';
import { PlayerProvider } from '@/features/player/PlayerProvider';

type Handler = (url: URL, init: RequestInit) => unknown;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    const method = init.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: init.body });
    const key = Object.keys(routes)
      .filter((route) => {
        const [m, p] = route.split(' ');
        return m === method && p !== undefined && url.pathname.startsWith(p);
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key)
      return json({ error: { code: 'not_mocked', message: `${method} ${url.pathname}` } }, 404);
    const route = routes[key];
    const result = typeof route === 'function' ? (route as Handler)(url, init) : route;
    return result instanceof Response ? result : json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export class SilentMedia implements MediaLike {
  src = '';
  currentTime = 0;
  playbackRate = 1;
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  private listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  /** Simulates a media event, e.g. `ended` when a sentence finishes. */
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

export function renderWithApp(
  element: ReactNode,
  { path = '/', route = '/', client }: { path?: string; route?: string; client?: QueryClient } = {},
) {
  const queryClient = client ?? createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const media = new SilentMedia();
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <p>Elsewhere</p> },
    ],
    { initialEntries: [route] },
  );
  const view = render(
    <ToastProvider>
      <QueryClientProviderShim client={queryClient}>
        <PlayerProvider media={media}>
          <RouterProvider router={router} />
        </PlayerProvider>
      </QueryClientProviderShim>
    </ToastProvider>,
  );
  return { ...view, router, media, queryClient };
}

function QueryClientProviderShim({
  client,
  children,
}: Readonly<{ client: QueryClient; children: ReactNode }>) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export const preferences: Preferences = {
  defaultVoiceId: 'kokoro:af_heart',
  playbackRate: 1,
  pace: 1,
  exportFormat: 'mp3',
  autoScroll: true,
  skipSeconds: 15,
};

export const voice = (overrides: Partial<VoiceInfo> = {}): VoiceInfo => ({
  id: 'kokoro:af_heart',
  engineId: 'kokoro',
  name: 'Heart',
  language: 'English (US)',
  languageCode: 'en-us',
  gender: 'female',
  category: 'built-in',
  qualityGrade: 'A',
  description: '',
  available: true,
  ...overrides,
});

export const kokoro = (overrides: Partial<EngineInfo> = {}): EngineInfo => ({
  id: 'kokoro',
  name: 'Kokoro',
  description: 'Fast voices',
  license: 'Apache-2.0',
  optional: false,
  status: 'ready',
  statusMessage: 'Ready',
  supportsCloning: false,
  controls: [],
  languages: ['English (US)'],
  sampleRate: 24000,
  device: 'cpu',
  hardwareNote: 'CPU only',
  installOptions: [
    {
      id: 'default',
      label: 'Kokoro',
      description: '',
      downloadBytes: 353_719_767,
      diskBytes: 353_719_767,
      recommended: true,
    },
  ],
  installedBytes: 353_719_767,
  installJobId: null,
  ...overrides,
});

export const documentDetail = (overrides: Partial<DocumentDetail> = {}): DocumentDetail => ({
  id: 'a'.repeat(32),
  title: 'The Lighthouse',
  filename: 'lighthouse.pdf',
  fileType: 'pdf',
  sizeBytes: 2_400_000,
  charCount: 9000,
  wordCount: 1500,
  pageCount: 12,
  segmentCount: 4,
  sectionCount: 2,
  estimatedSeconds: 600,
  createdAt: '2026-10-19T10:00:00+00:00',
  lastOpenedAt: null,
  progress: null,
  sections: [
    { index: 0, title: 'Chapter One', startSegment: 0, segmentCount: 2, page: 1 },
    { index: 1, title: 'Chapter Two', startSegment: 2, segmentCount: 2, page: 5 },
  ],
  warnings: [],
  ...overrides,
});
