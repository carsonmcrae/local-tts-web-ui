// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: The reading view for one document.
 * Scope: Loads the document into the player at the saved position (without auto-playing), follows
 *   the spoken section while playing, offers the contents and bookmarks panel (sidebar on desktop,
 *   dialog on phones), search, and the "adjust this section" correction, jumps to any sentence
 *   from them, and composes the header, warnings, section text and section pager.
 * Does NOT belong: Player controls (PlayerBar) or text rendering details (DocumentText).
 */
import { ListTree, PenLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { useDocument, usePreferences } from '@/api/queries';
import { useBookmarks } from '@/api/readingQueries';
import type { DocumentDetail, SectionOut } from '@/api/types';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, EmptyState, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { usePageTitle } from '@/components/ui/Layout';
import { DefaultVoicesBanner } from '@/features/engines/EngineSetup';
import type { PlayerDocument } from '@/features/player/controller';
import { usePlayer } from '@/features/player/PlayerProvider';
import { AdjustSectionDialog } from './AdjustSectionDialog';
import { ReaderPanels } from './ReaderPanels';
import { ReaderHeader, SectionBody, SectionPager } from './ReaderParts';
import { SearchDialog } from './SearchDialog';
import { SectionNav } from './SectionNav';

function toPlayerDocument(doc: DocumentDetail): PlayerDocument {
  return {
    id: doc.id,
    title: doc.title,
    segmentCount: doc.segmentCount,
    estimatedSeconds: doc.estimatedSeconds,
    sections: doc.sections,
  };
}

function sectionOf(doc: Pick<DocumentDetail, 'sections'>, segment: number): number {
  return (
    doc.sections.find((s) => segment >= s.startSegment && segment < s.startSegment + s.segmentCount)
      ?.index ?? 0
  );
}

/** Narration is under way: playing, or fetching the next sentence to play. */
const isNarrating = (status: string) => status === 'playing' || status === 'loading';

function Reader({ doc }: Readonly<{ doc: DocumentDetail }>) {
  usePageTitle(doc.title);
  const { controller, state } = usePlayer();
  const preferences = usePreferences();
  const isLoaded = state.document?.id === doc.id;
  const speaking = isLoaded ? (controller.sectionAt(state.segmentIndex)?.index ?? null) : null;
  const [viewed, setViewed] = useState(() => sectionOf(doc, doc.progress?.segmentIndex ?? 0));
  const [followed, setFollowed] = useState(speaking);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const bookmarks = useBookmarks(doc.id);
  const bookmarked = useMemo(
    () => new Set((bookmarks.data ?? []).map((bookmark) => bookmark.segmentIndex)),
    [bookmarks.data],
  );
  const [adjusting, setAdjusting] = useState<SectionOut | undefined>();
  const playerDoc = useMemo(() => toPlayerDocument(doc), [doc]);

  // Follow the narration into the next section (adjusting state during render, not in an effect).
  // Moving to the next sentence sets its index together with `loading`, so following only while
  // `playing` would never fire at a section boundary.
  if (speaking !== followed) {
    setFollowed(speaking);
    if (speaking !== null && isNarrating(state.status)) setViewed(speaking);
  }

  useEffect(() => {
    if (state.document?.id !== doc.id)
      void controller.load(playerDoc, doc.progress?.segmentIndex ?? 0, false);
    // Only when the document changes; the player owns the position afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // A corrected section changes the document; the player keeps following the new boundaries.
  useEffect(() => controller.refresh(playerDoc), [controller, playerDoc]);

  /** Show a sentence and move the playback position to it (from contents, bookmarks or search). */
  const jumpTo = (segmentIndex: number, sectionIndex: number) => {
    setViewed(sectionIndex);
    setTocOpen(false);
    setSearchOpen(false);
    if (isLoaded) void controller.seek(segmentIndex);
    else void controller.load(playerDoc, segmentIndex, false);
  };
  const jump = (target: SectionOut) => jumpTo(target.startSegment, target.index);
  const playFrom = (index: number) => {
    if (isLoaded && index === state.segmentIndex && state.status !== 'playing')
      void controller.play();
    else void controller.load(playerDoc, index, true);
  };
  const resumeAt = isLoaded ? state.segmentIndex : (doc.progress?.segmentIndex ?? 0);
  const playingThis = isLoaded && isNarrating(state.status);
  const panels = (
    <ReaderPanels
      doc={doc}
      contents={
        <SectionNav sections={doc.sections} viewed={viewed} speaking={speaking} onSelect={jump} />
      }
      onBookmark={(bookmark) => jumpTo(bookmark.segmentIndex, bookmark.sectionIndex)}
    />
  );
  const multiSection = doc.sections.length > 1;

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <aside
        className="sticky top-6 hidden max-h-[calc(100dvh-12rem)] w-64 shrink-0 scrollbar-thin self-start overflow-y-auto lg:block"
        aria-label="Document contents"
      >
        {panels}
      </aside>
      <article className="min-w-0 flex-1">
        <ReaderHeader
          doc={doc}
          onContents={() => setTocOpen(true)}
          onSearch={() => setSearchOpen(true)}
          onPlay={() => (playingThis ? controller.pause() : playFrom(resumeAt))}
          playing={playingThis}
        />
        <DefaultVoicesBanner />
        {doc.warnings.map((warning) => (
          <Banner key={warning} tone="warning" className="mb-6">
            {warning}
          </Banner>
        ))}
        {multiSection ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-muted">
              Section {viewed + 1} of {doc.sections.length} · {doc.sections[viewed]?.title}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={<PenLine size={14} />}
              onClick={() => setAdjusting(doc.sections[viewed])}
            >
              Adjust this section
            </Button>
          </div>
        ) : null}
        <SectionBody
          documentId={doc.id}
          sectionIndex={viewed}
          activeIndex={isLoaded ? state.segmentIndex : null}
          bookmarked={bookmarked}
          autoScroll={preferences.data?.autoScroll ?? true}
          onSelect={playFrom}
        />
        <SectionPager
          previous={doc.sections[viewed - 1]}
          next={doc.sections[viewed + 1]}
          onSelect={(section) => setViewed(section.index)}
        />
      </article>
      <Dialog open={tocOpen} onOpenChange={setTocOpen} title="Contents">
        {panels}
      </Dialog>
      <SearchDialog
        documentId={doc.id}
        sections={doc.sections}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onJump={jumpTo}
      />
      {adjusting ? (
        <AdjustSectionDialog
          key={adjusting.index}
          documentId={doc.id}
          section={adjusting}
          onClose={() => setAdjusting(undefined)}
        />
      ) : null}
    </div>
  );
}

export default function ReaderPage() {
  const { documentId } = useParams();
  const document = useDocument(documentId);
  if (document.isPending) {
    return (
      <StatusRegion label="Loading document" className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="mb-4 h-8 w-2/3" />
        <Skeleton className="mb-10 h-5 w-1/3" />
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="mb-3 h-5" />
        ))}
      </StatusRegion>
    );
  }
  if (document.isError) {
    const missing = document.error instanceof ApiError && document.error.status === 404;
    return (
      <EmptyState
        icon={<ListTree size={26} />}
        title={
          missing
            ? 'This document is no longer in your library'
            : "This document couldn't be opened"
        }
        actions={
          <Link to="/library" className={buttonClasses('primary')}>
            Back to library
          </Link>
        }
      >
        {missing ? 'It may have been deleted.' : describeError(document.error)}
      </EmptyState>
    );
  }
  return <Reader key={document.data.id} doc={document.data} />;
}
