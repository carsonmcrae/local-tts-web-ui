/**
 * Purpose: Tests for the reading view: contents, paging, play/resume, read-along and its keyboard
 *   model, auto-scroll, and loading/error states.
 * Scope: ReaderPage with ReaderParts, SectionNav and DocumentText against the mocked API; the
 *   player's controller is reached through a small spy component where a test needs to act on it.
 * Does NOT belong: Player controls (features/player tests) or exporting (export.test.tsx).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentDetail } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import {
  documentDetail,
  json,
  mockApi,
  PlayerSpy,
  preferences,
  mockReaderApi,
  renderWithApp,
} from '@/test/render';
import ReaderPage from './ReaderPage';

afterEach(() => vi.unstubAllGlobals());

const book = documentDetail({
  segmentCount: 6,
  sections: [
    { index: 0, title: 'Chapter One', startSegment: 0, segmentCount: 3, page: 1 },
    { index: 1, title: 'Chapter Two', startSegment: 3, segmentCount: 3, page: 5 },
  ],
});

type Player = ReturnType<typeof usePlayer>;

/** Renders the reader (optionally inside <main>, the scroll container) and exposes the player. */
async function openReader(doc: DocumentDetail = book, wrap = (page: ReactNode) => page) {
  const user = userEvent.setup();
  const latest: { player: Player | null } = { player: null };
  const view = renderWithApp(
    wrap(
      <>
        <ReaderPage />
        <PlayerSpy onPlayer={(player) => (latest.player = player)} />
      </>,
    ),
    { path: '/read/:documentId', route: `/read/${doc.id}` },
  );
  await screen.findByRole('heading', { level: 1, name: doc.title });
  const controller = () => (latest.player as Player).controller;
  const state = () => (latest.player as Player).state;
  return { user, controller, state, ...view };
}

const sentence = (text: string) => screen.getByRole('button', { name: text });

describe('Reader navigation', () => {
  it('jumps through the contents dialog, the sidebar and the section pager', async () => {
    mockReaderApi(book);
    const { user, state } = await openReader();
    expect(screen.getByText('Section 1 of 2 · Chapter One')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Contents' }));
    const dialog = await screen.findByRole('dialog', { name: 'Contents' });
    await user.click(within(dialog).getByRole('button', { name: /Chapter Two/ }));
    expect(await screen.findByText('Section 2 of 2 · Chapter Two')).toBeInTheDocument();
    await waitFor(() => expect(state().segmentIndex).toBe(3));
    const pager = screen.getByRole('navigation', { name: 'Section navigation' });
    await user.click(within(pager).getByRole('button', { name: 'Chapter One' }));
    expect(await screen.findByText('Section 1 of 2 · Chapter One')).toBeInTheDocument();
    await user.click(within(pager).getByRole('button', { name: 'Chapter Two' }));
    expect(await screen.findByText('Section 2 of 2 · Chapter Two')).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'Document contents' });
    await user.click(within(sidebar).getByRole('button', { name: /Chapter One/ }));
    await waitFor(() => expect(state().segmentIndex).toBe(0));
  });

  it('keeps the playback position when the reader is opened again', async () => {
    mockReaderApi(book);
    const { router, state, controller } = await openReader();
    await act(() => controller().seek(2));
    await act(() => router.navigate('/library'));
    await act(() => router.navigate(`/read/${book.id}`));
    await screen.findByRole('heading', { level: 1, name: book.title });
    expect(state()).toMatchObject({ segmentIndex: 2, status: 'paused' });
  });

  it('loads the document again when jumping after the player was cleared', async () => {
    mockReaderApi(book);
    const { user, controller, state } = await openReader();
    act(() => controller().unload());
    const sidebar = screen.getByRole('complementary', { name: 'Document contents' });
    await user.click(within(sidebar).getByRole('button', { name: /Chapter Two/ }));
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 3, status: 'paused' }));
    expect(state().document?.id).toBe(book.id);
  });
});

describe('Reader playback', () => {
  it('resumes from the saved sentence and pauses from the header', async () => {
    mockReaderApi(
      documentDetail({
        ...book,
        filename: null,
        progress: {
          segmentIndex: 1,
          voiceId: null,
          updatedAt: '2026-10-19T11:00:00Z',
          percent: 20,
        },
      }),
    );
    const { user, state } = await openReader();
    expect(screen.getByText('20% listened')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 1, status: 'playing' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(state().status).toBe('paused'));
  });

  it('plays from a clicked sentence, restarting it when it is already playing', async () => {
    mockReaderApi(book);
    const { user, state, controller } = await openReader();
    await user.click(await screen.findByText('Sentence 2.'));
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 1, status: 'playing' }));
    await user.click(screen.getByText('Sentence 2.'));
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 1, status: 'playing' }));
    act(() => controller().unload());
    await user.click(screen.getByText('Sentence 3.'));
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 2, status: 'playing' }));
  });

  it('makes the text one tab stop with arrow keys between sentences', async () => {
    mockReaderApi(book);
    const { user, state } = await openReader();
    const heading = await screen.findByRole('button', { name: 'Chapter One' });
    expect(heading).toHaveAttribute('tabindex', '0');
    expect(sentence('Sentence 2.')).toHaveAttribute('tabindex', '-1');
    act(() => heading.focus());
    await user.keyboard('{ArrowLeft}');
    expect(heading).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(sentence('Sentence 3.')).toHaveFocus();
    await user.keyboard('{ArrowUp}x');
    expect(sentence('Sentence 2.')).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(state()).toMatchObject({ segmentIndex: 1, status: 'playing' }));
    await user.keyboard('{ArrowRight} ');
    await waitFor(() => expect(state().segmentIndex).toBe(2));
    expect(sentence('Sentence 3.')).toHaveAttribute('aria-current', 'true');
  });
});

describe('Read-along scrolling', () => {
  const inMain = (page: ReactNode) => <main>{page}</main>;

  it('keeps the spoken sentence in view, smoothly or instantly', async () => {
    mockReaderApi(book);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    const { controller } = await openReader(book, inMain);
    await act(() => controller().seek(1));
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    await act(() => controller().seek(2));
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('leaves the page alone while the sentence is visible or the reader scrolled recently', async () => {
    mockReaderApi(book);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    const { controller } = await openReader(book, inMain);
    const visible = { top: 300, bottom: 320, left: 0, right: 10, width: 10, height: 20 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(visible as DOMRect);
    scroll.mockClear();
    await act(() => controller().seek(1));
    expect(scroll).not.toHaveBeenCalled();
    vi.mocked(Element.prototype.getBoundingClientRect).mockRestore();
    act(() => {
      screen.getByRole('main').dispatchEvent(new Event('wheel'));
    });
    await act(() => controller().seek(2));
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not scroll when following along is turned off', async () => {
    mockReaderApi(book, { 'GET /api/preferences': { ...preferences, autoScroll: false } });
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    const { controller } = await openReader(book, inMain);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled());
    scroll.mockClear();
    await act(() => controller().seek(1));
    expect(sentence('Sentence 2.')).toHaveAttribute('data-active', 'true');
    expect(scroll).not.toHaveBeenCalled();
  });

  it('skips scrolling when the spoken sentence is in another section or nothing is loaded', async () => {
    mockReaderApi(book);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    const { user, controller } = await openReader(book, inMain);
    const pager = screen.getByRole('navigation', { name: 'Section navigation' });
    await user.click(within(pager).getByRole('button', { name: 'Chapter Two' }));
    await screen.findByText('Sentence 5.');
    scroll.mockClear();
    await act(() => controller().seek(1));
    act(() => controller().unload());
    expect(sentence('Sentence 5.')).toHaveAttribute('data-active', 'false');
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('Reader states', () => {
  it('shows warnings and explains a section that fails to load', async () => {
    mockReaderApi(documentDetail({ ...book, warnings: ['Two pages had no text.'] }), {
      [`GET /api/documents/${book.id}/sections/`]: json(
        { error: { code: 'section_missing', message: 'That section is missing.' } },
        404,
      ),
    });
    await openReader();
    expect(screen.getByText('Two pages had no text.')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This section couldn't be loaded");
    expect(alert).toHaveTextContent('That section is missing.');
  });

  it('explains a document that cannot be opened', async () => {
    mockApi({
      'GET /api/preferences': preferences,
      'GET /api/documents/': json(
        { error: { code: 'corrupt', message: 'The file is damaged.' } },
        500,
      ),
    });
    renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${book.id}` });
    expect(await screen.findByText("This document couldn't be opened")).toBeInTheDocument();
    expect(screen.getByText('The file is damaged.')).toBeInTheDocument();
  });
});
