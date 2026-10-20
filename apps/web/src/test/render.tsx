/**
 * Purpose: Test harness for rendering screens with the app's real providers.
 * Scope: A route-table API mock for `fetch` (matched by method and path prefix), sample API objects,
 *   routes for reading a document (details, section text, segment audio), `renderWithApp` that
 *   mounts the component inside QueryClient, Toast and Player providers and a memory router, and
 *   `PlayerSpy` for tests that need to drive the shared player directly.
 * Does NOT belong: Assertions or per-test data beyond shared fixtures.
 */
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, vi } from 'vitest';
import type { DocumentDetail, EngineInfo, Preferences, VoiceInfo, VoiceProfile } from '@/api/types';
import { createQueryClient } from '@/app/App';
import { ToastProvider } from '@/components/ui/Toast';
import type { MediaLike } from '@/features/player/controller';
import { PlayerProvider, usePlayer } from '@/features/player/PlayerProvider';

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
    // Handlers may return a promise, e.g. to hold a request open while a test inspects the UI.
    const result: unknown =
      typeof route === 'function' ? await (route as Handler)(url, init) : route;
    return result instanceof Response ? result : json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

class SilentMedia implements MediaLike {
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
  updateAvailable: false,
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

/** Text of one section: its title as a heading, then "Sentence N." for each later segment. */
function sectionText(doc: DocumentDetail, sectionIndex: number) {
  const section = doc.sections[sectionIndex];
  const start = section?.startSegment ?? 0;
  const count = section?.segmentCount ?? doc.segmentCount;
  return {
    sectionIndex,
    segments: Array.from({ length: count }, (_, offset) => ({
      index: start + offset,
      sectionIndex,
      paragraphIndex: offset === 0 && section ? 0 : 1,
      kind: offset === 0 && section ? ('heading' as const) : ('paragraph' as const),
      boundary: 'sentence' as const,
      text: offset === 0 && section ? section.title : `Sentence ${start + offset + 1}.`,
    })),
  };
}

/** Routes for reading `doc`: its details, each section's text and audio for every segment. */
export function readerRoutes(doc: DocumentDetail = documentDetail()) {
  return {
    [`GET /api/documents/${doc.id}`]: doc,
    [`GET /api/documents/${doc.id}/sections/`]: (url: URL) =>
      sectionText(doc, Number(url.pathname.split('/').pop())),
    [`GET /api/documents/${doc.id}/segments`]: () =>
      new Response(new Blob(['wav']), { headers: { 'X-Audio-Duration': '2' } }),
  };
}

type Player = ReturnType<typeof usePlayer>;

/** The API a reader page needs: one engine, preferences, one voice and the document's routes. */
export function mockReaderApi(doc: DocumentDetail, overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    'PUT /api/documents/': {},
    ...readerRoutes(doc),
    ...overrides,
  });
}

export const voiceProfile = (overrides: Partial<VoiceProfile> = {}): VoiceProfile => ({
  id: 'c'.repeat(32), voiceId: `custom:${'c'.repeat(32)}`, name: 'My voice', engineId: 'chatterbox', durationS: 14,
  sampleRate: 24000, consentedAt: '2026-10-19T10:00:00+00:00', source: 'import', createdAt: '2026-10-19T10:00:00+00:00',
  stores: 'A trimmed copy of your reference recording (WAV).', kind: 'quick', delivery: 'natural',
  quality: { durationS: 14, speechS: 12, rmsDbfs: -20, peakDbfs: -1, clippingRatio: 0, pauseRatio: 0.2, snrDb: 40, brightnessDb: -6, ok: true, issues: [] },
  ...overrides,
}); // prettier-ignore

/** Hands the app's player (controller and current state) to a test after every render. */
export function PlayerSpy({ onPlayer }: Readonly<{ onPlayer: (player: Player) => void }>) {
  const player = usePlayer();
  useEffect(() => {
    onPlayer(player);
  }, [onPlayer, player]);
  return null;
}

/** Presses a wizard's Done button and waits for the dialog to close. */
export async function pressDone(user: UserEvent, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

/** Fills in a wizard's "Name & consent" step and presses "Create voice". */
export async function nameAndConsent(user: UserEvent, dialog: HTMLElement, name: string) {
  await user.type(within(dialog).getByLabelText('Voice name'), name);
  await user.click(await within(dialog).findByLabelText('I have permission to use this voice.'));
  await user.click(within(dialog).getByRole('button', { name: 'Create voice' }));
}

/** In the open "Create a voice" chooser, picks the quick route and returns its wizard dialog. */
export async function chooseQuickVoice(user: UserEvent) {
  const chooser = await screen.findByRole('dialog', { name: 'Create a voice' });
  await user.click(within(chooser).getByRole('button', { name: /Quick voice/ }));
  return screen.findByRole('dialog', { name: 'Create a quick voice' });
}

/** Drives animation frames and the clock by hand so elapsed time is deterministic. */
export function controlFrames() {
  const frames: { next: FrameRequestCallback | null; now: number } = { next: null, now: 0 };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.next = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames.next = null;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => frames.now);
  return (seconds: number) => {
    frames.now = seconds * 1000;
    const callback = frames.next;
    act(() => callback?.(frames.now));
  };
}
