/**
 * Purpose: The reading view for one document.
 * Scope: Loads the document into the player at the saved position (without auto-playing), shows
 *   metadata and extraction warnings, offers the contents panel (sidebar on desktop, dialog on
 *   phones), follows the spoken section, and renders the current section's text with read-along.
 * Does NOT belong: Player controls (PlayerBar) or text rendering details (DocumentText).
 */
import { ArrowLeft, ChevronLeft, ChevronRight, ListTree, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { useDocument, usePreferences, useSection } from '@/api/queries';
import type { DocumentDetail, SectionOut } from '@/api/types';
import { Button, buttonClasses, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge, Banner, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { usePageTitle } from '@/components/ui/Layout';
import { DefaultVoicesBanner } from '@/features/engines/EngineSetup';
import type { PlayerDocument } from '@/features/player/controller';
import { usePlayer } from '@/features/player/PlayerProvider';
import { documentFacts } from '@/features/library/DocumentCard';
import { DocumentText } from './DocumentText';
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

function Reader({ doc }: Readonly<{ doc: DocumentDetail }>) {
  usePageTitle(doc.title);
  const { controller, state } = usePlayer();
  const preferences = usePreferences();
  const isLoaded = state.document?.id === doc.id;
  const speakingSection = isLoaded ? (controller.sectionAt(state.segmentIndex)?.index ?? null) : null;
  const [viewed, setViewed] = useState<number>(() => {
    const start = doc.progress?.segmentIndex ?? 0;
    return doc.sections.find((s) => start >= s.startSegment && start < s.startSegment + s.segmentCount)?.index ?? 0;
  });
  const [tocOpen, setTocOpen] = useState(false);
  const section = useSection(doc.id, viewed);
  const playerDoc = useMemo(() => toPlayerDocument(doc), [doc]);

  useEffect(() => {
    if (state.document?.id !== doc.id) void controller.load(playerDoc, doc.progress?.segmentIndex ?? 0, false);
    // Only when the document changes; the player owns position afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    if (speakingSection !== null && state.status === 'playing') setViewed(speakingSection);
  }, [speakingSection, state.status]);

  const jump = (target: SectionOut) => {
    setViewed(target.index);
    setTocOpen(false);
    if (isLoaded) void controller.seek(target.startSegment);
    else void controller.load(playerDoc, target.startSegment, false);
  };
  const playFrom = (index: number) => {
    if (!isLoaded) void controller.load(playerDoc, index, true);
    else if (index === state.segmentIndex && state.status !== 'playing') void controller.play();
    else void controller.load(playerDoc, index, true);
  };
  const previous = doc.sections[viewed - 1];
  const next = doc.sections[viewed + 1];
  const nav = <SectionNav sections={doc.sections} viewed={viewed} speaking={speakingSection} onSelect={jump} />;

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-8 sm:py-8">
      {doc.sections.length > 1 ? (
        <aside className="sticky top-6 hidden max-h-[calc(100dvh-12rem)] w-64 shrink-0 self-start overflow-y-auto scrollbar-thin lg:block" aria-label="Document contents">
          <p className="mb-2 px-2.5 text-xs font-semibold tracking-wide text-subtle uppercase">Contents</p>
          {nav}
        </aside>
      ) : null}
      <article className="min-w-0 flex-1">
        <header className="mb-8 border-b border-line pb-6">
          <Link to="/library" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-text">
            <ArrowLeft size={15} /> Library
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{doc.title}</h1>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {documentFacts(doc).map((fact) => (
                  <Badge key={fact}>{fact}</Badge>
                ))}
                {doc.progress ? <Badge tone="accent">{Math.round(doc.progress.percent)}% listened</Badge> : null}
              </div>
              {doc.filename ? <p className="mt-2 truncate text-xs text-subtle">{doc.filename}</p> : null}
            </div>
            <div className="flex shrink-0 gap-2">
              {doc.sections.length > 1 ? (
                <IconButton label="Contents" icon={<ListTree size={18} />} variant="secondary" className="lg:hidden" onClick={() => setTocOpen(true)} />
              ) : null}
              <Button variant="primary" icon={<Play size={16} fill="currentColor" />} onClick={() => playFrom(isLoaded ? state.segmentIndex : (doc.progress?.segmentIndex ?? 0))}>
                {doc.progress && doc.progress.segmentIndex > 0 ? 'Resume' : 'Play'}
              </Button>
            </div>
          </div>
        </header>
        <DefaultVoicesBanner />
        {doc.warnings.map((warning) => (
          <Banner key={warning} tone="warning" className="mb-6">
            {warning}
          </Banner>
        ))}
        {doc.sections.length > 1 ? (
          <p className="mb-6 text-[13px] font-medium text-muted">
            Section {viewed + 1} of {doc.sections.length} · {doc.sections[viewed]?.title}
          </p>
        ) : null}
        {section.isPending ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading text">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-5 w-full" />
            ))}
          </div>
        ) : section.isError ? (
          <Banner tone="error" title="This section couldn't be loaded">
            {describeError(section.error)}
          </Banner>
        ) : (
          <DocumentText
            segments={section.data.segments}
            activeIndex={isLoaded ? state.segmentIndex : null}
            autoScroll={preferences.data?.autoScroll ?? true}
            onSelect={playFrom}
          />
        )}
        {previous || next ? (
          <nav aria-label="Section navigation" className="reader-text mx-auto mt-12 flex justify-between gap-3 border-t border-line pt-6 font-sans">
            {previous ? (
              <Button variant="ghost" icon={<ChevronLeft size={16} />} onClick={() => setViewed(previous.index)}>
                <span className="max-w-48 truncate">{previous.title}</span>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="ghost" onClick={() => setViewed(next.index)}>
                <span className="max-w-48 truncate">{next.title}</span>
                <ChevronRight size={16} />
              </Button>
            ) : null}
          </nav>
        ) : null}
      </article>
      <Dialog open={tocOpen} onOpenChange={setTocOpen} title="Contents">
        {nav}
      </Dialog>
    </div>
  );
}

export default function ReaderPage() {
  const { documentId } = useParams();
  const document = useDocument(documentId);
  if (document.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10" role="status" aria-label="Loading document">
        <Skeleton className="mb-4 h-8 w-2/3" />
        <Skeleton className="mb-10 h-5 w-1/3" />
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="mb-3 h-5" />
        ))}
      </div>
    );
  }
  if (document.isError) {
    const missing = document.error instanceof ApiError && document.error.status === 404;
    return (
      <EmptyState
        icon={<ListTree size={26} />}
        title={missing ? 'This document is no longer in your library' : "This document couldn't be opened"}
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
