/**
 * Purpose: Tests for the player provider's integrations and the voice grouping helper.
 * Scope: Media Session metadata and lock-screen actions (including browsers that reject some
 *   actions), debounced reading-progress saves (success and failure), media failures that are not
 *   API errors, misuse outside the provider, and voice-group ordering.
 * Does NOT belong: Player controls (player.test.tsx) or the state machine (controller.test.ts).
 */
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentDetail } from '@/api/types';
import ReaderPage from '@/features/reader/ReaderPage';
import { documentDetail, json, mockReaderApi, renderWithApp, voice } from '@/test/render';
import { PlayerBar } from './PlayerBar';
import { usePlayer } from './PlayerProvider';
import { groupVoices } from './VoicePicker';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaSession');
});

function renderReader(doc: DocumentDetail, withPlayer = false) {
  return renderWithApp(
    <>
      <ReaderPage />
      {withPlayer ? <PlayerBar /> : null}
    </>,
    { path: '/read/:documentId', route: `/read/${doc.id}` },
  );
}

/** A Media Session stub; actions listed in `unsupported` throw, as some browsers do. */
function installMediaSession(unsupported: string[] = []) {
  const handlers = new Map<string, (() => void) | null>();
  const session = {
    metadata: null as null | Record<string, string>,
    playbackState: 'none',
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      handlers.set(action, handler);
      if (unsupported.includes(action)) throw new TypeError(`${action} is not supported`);
    }),
  };
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(init: Record<string, string>) {
        Object.assign(this, init);
      }
    },
  );
  const run = (action: string) => act(() => handlers.get(action)?.());
  return { session, handlers, run };
}

describe('Media Session', () => {
  it('shows the document on the lock screen and answers hardware media keys', async () => {
    const doc = documentDetail();
    mockReaderApi(doc);
    const { session, handlers, run } = installMediaSession(['nexttrack']);
    const { unmount } = renderReader(doc);
    await waitFor(() =>
      expect(session.metadata).toMatchObject({ title: 'The Lighthouse', artist: 'Chapter One' }),
    );
    expect(session.playbackState).toBe('paused');
    await run('play');
    await waitFor(() => expect(session.playbackState).toBe('playing'));
    await run('pause');
    await waitFor(() => expect(session.playbackState).toBe('paused'));
    await run('nexttrack');
    await waitFor(() => expect(session.metadata).toMatchObject({ artist: 'Chapter One' }));
    await run('previoustrack');
    unmount();
    expect(handlers.get('nexttrack')).toBeNull();
    expect(session.setActionHandler).toHaveBeenCalledWith('play', null);
  });

  it('falls back to the app name when the position is outside any section', async () => {
    const doc = documentDetail({ sections: [], sectionCount: 0 });
    mockReaderApi(doc);
    const { session } = installMediaSession();
    renderReader(doc);
    await waitFor(() => expect(session.metadata).toMatchObject({ artist: 'Local TTS' }));
  });
});

describe('PlayerProvider', () => {
  it('saves the reading position after a short pause and refreshes the document', async () => {
    const doc = documentDetail();
    const { calls } = mockReaderApi(doc);
    renderReader(doc);
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/progress'))).toBe(true), {
      timeout: 2000,
    });
    await waitFor(() =>
      expect(calls.filter((call) => call.path === `/api/documents/${doc.id}`)).toHaveLength(2),
    );
  });

  it('ignores a failed progress save', async () => {
    const doc = documentDetail();
    const { calls } = mockReaderApi(doc, {
      'PUT /api/documents/': json({ error: { code: 'busy', message: 'Busy.' } }, 503),
    });
    renderReader(doc);
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/progress'))).toBe(true), {
      timeout: 2000,
    });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The Lighthouse');
  });

  it('reports media failures that are not API errors in plain language', async () => {
    const doc = documentDetail();
    mockReaderApi(doc);
    const user = userEvent.setup();
    const { media } = renderReader(doc, true);
    media.play.mockRejectedValueOnce(new Error('The audio could not be decoded.'));
    const player = await screen.findByRole('region', { name: 'Audio player' });
    await user.click(within(player).getByRole('button', { name: 'Play' }));
    const alert = await within(player).findByRole('alert');
    expect(alert).toHaveTextContent('The audio could not be decoded.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('must be used inside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => usePlayer())).toThrow(/inside <PlayerProvider>/);
  });
});

describe('groupVoices', () => {
  it('lists your voices first, then English variants, then other languages', () => {
    const voices = [
      voice({ id: 'fr', language: 'French' }),
      voice({ id: 'de', language: 'German' }),
      voice({ id: 'us', language: 'English (US)' }),
      voice({ id: 'mine', category: 'custom', language: 'English' }),
      voice({ id: 'uk', language: 'English (UK)' }),
      voice({ id: 'es', language: 'Spanish' }),
    ];
    expect(groupVoices(voices, '').map(([group]) => group)).toEqual([
      'Your voices',
      'English (UK)',
      'English (US)',
      'French',
      'German',
      'Spanish',
    ]);
    expect(groupVoices(voices.toReversed(), '').map(([group]) => group)[0]).toBe('Your voices');
  });
});
