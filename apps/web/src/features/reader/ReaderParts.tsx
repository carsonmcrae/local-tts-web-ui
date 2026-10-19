/**
 * Purpose: Presentational building blocks of the reading view.
 * Scope: `ReaderHeader` (back link, title, document facts, contents and play buttons),
 *   `SectionBody` (loads one section; loading/error/text states) and `SectionPager`.
 * Does NOT belong: Player coordination (ReaderPage) or sentence rendering (DocumentText).
 */
import { ArrowLeft, ChevronLeft, ChevronRight, ListTree, Pause, Play } from 'lucide-react';
import { Link } from 'react-router';
import { describeError } from '@/api/client';
import { useSection } from '@/api/queries';
import type { DocumentDetail, SectionOut } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { documentFacts } from '@/features/library/DocumentCard';
import { DocumentText } from './DocumentText';

interface HeaderProps {
  doc: DocumentDetail;
  onContents: (() => void) | undefined;
  onPlay: () => void;
  playing: boolean;
}

export function ReaderHeader({ doc, onContents, onPlay, playing }: Readonly<HeaderProps>) {
  const resuming = Boolean(doc.progress && doc.progress.segmentIndex > 0);
  return (
    <header className="mb-8 border-b border-line pb-6">
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> Library
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
            {doc.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {documentFacts(doc).map((fact) => (
              <Badge key={fact}>{fact}</Badge>
            ))}
            {doc.progress ? (
              <Badge tone="accent">{Math.round(doc.progress.percent)}% listened</Badge>
            ) : null}
          </div>
          {doc.filename ? (
            <p className="mt-2 truncate text-xs text-subtle">{doc.filename}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {onContents ? (
            <IconButton
              label="Contents"
              icon={<ListTree size={18} />}
              variant="secondary"
              className="lg:hidden"
              onClick={onContents}
            />
          ) : null}
          <Button
            variant="primary"
            icon={
              playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )
            }
            onClick={onPlay}
          >
            {playing ? 'Pause' : resuming ? 'Resume' : 'Play'}
          </Button>
        </div>
      </div>
    </header>
  );
}

interface BodyProps {
  documentId: string;
  sectionIndex: number;
  activeIndex: number | null;
  autoScroll: boolean;
  onSelect: (index: number) => void;
}

export function SectionBody({
  documentId,
  sectionIndex,
  activeIndex,
  autoScroll,
  onSelect,
}: Readonly<BodyProps>) {
  const section = useSection(documentId, sectionIndex);
  if (section.isPending) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading text">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-5 w-full" />
        ))}
      </div>
    );
  }
  if (section.isError) {
    return (
      <Banner tone="error" title="This section couldn't be loaded">
        {describeError(section.error)}
      </Banner>
    );
  }
  return (
    <DocumentText
      segments={section.data.segments}
      activeIndex={activeIndex}
      autoScroll={autoScroll}
      onSelect={onSelect}
    />
  );
}

interface PagerProps {
  previous: SectionOut | undefined;
  next: SectionOut | undefined;
  onSelect: (section: SectionOut) => void;
}

export function SectionPager({ previous, next, onSelect }: Readonly<PagerProps>) {
  if (!previous && !next) return null;
  return (
    <nav
      aria-label="Section navigation"
      className="reader-text mx-auto mt-12 flex justify-between gap-3 border-t border-line pt-6 font-sans"
    >
      {previous ? (
        <Button variant="ghost" icon={<ChevronLeft size={16} />} onClick={() => onSelect(previous)}>
          <span className="max-w-48 truncate">{previous.title}</span>
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button variant="ghost" onClick={() => onSelect(next)}>
          <span className="max-w-48 truncate">{next.title}</span>
          <ChevronRight size={16} />
        </Button>
      ) : null}
    </nav>
  );
}
