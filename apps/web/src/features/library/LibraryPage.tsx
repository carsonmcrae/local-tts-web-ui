// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The library — the app's home screen.
 * Scope: Upload/paste/web page entry points, drag-and-drop anywhere on the page, the rail of views,
 *   collections and folders (a select on phones), a "continue listening" card for the most recent
 *   document, the view's document list, a one-click sample, the tab to the included books, and
 *   loading/empty/error states.
 * Does NOT belong: Reading view (ReaderPage) or the list's filters and actions (LibraryList).
 */
import { BookMarked, BookOpen, PlayCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { describeError } from '@/api/client';
import { useCollections, useFolders } from '@/api/libraryQueries';
import { useDocuments, usePasteText } from '@/api/queries';
import type { DocumentSummary } from '@/api/types';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Banner, EmptyState, ProgressBar, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Layout';
import { DefaultVoicesBanner } from '@/features/engines/EngineSetup';
import { documentFacts } from './DocumentCard';
import { LibraryList } from './LibraryList';
import { LibraryRail, RailSelect } from './LibraryRail';
import { LibraryTabs } from './LibraryTabs';
import { SAMPLE_TEXT, SAMPLE_TITLE } from './sample';
import {
  DropTarget,
  PasteTextDialog,
  UploadButtons,
  UploadStatus,
  useDocumentIntake,
} from './UploadArea';
import { isResumable, parseView, selectDocuments } from './views';
import { WebPageDialog } from './WebPageDialog';

function ContinueCard({
  id,
  title,
  percent,
  facts,
}: Readonly<{ id: string; title: string; percent: number; facts: string }>) {
  return (
    <section
      aria-label="Continue listening"
      className="mb-8 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-soft"
    >
      <div className="flex flex-col gap-4 bg-gradient-to-br from-accent-soft to-transparent p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-accent-text">Continue listening</p>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{facts}</p>
          <div className="mt-3 flex max-w-sm items-center gap-3">
            <ProgressBar value={percent / 100} label={`${Math.round(percent)}% listened`} />
            <span className="text-xs text-muted tabular-nums">{Math.round(percent)}%</span>
          </div>
        </div>
        <Link to={`/read/${id}`} className={buttonClasses('primary', 'lg')}>
          <PlayCircle size={18} /> Resume
        </Link>
      </div>
    </section>
  );
}

function LibraryContent({
  documents,
  emptyActions,
}: Readonly<{ documents: ReturnType<typeof useDocuments>; emptyActions: ReactNode }>) {
  const [params] = useSearchParams();
  const view = parseView(params);
  const folders = useFolders();
  const collections = useCollections();
  if (documents.isPending) {
    return (
      <StatusRegion label="Loading documents" className="flex flex-col gap-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-24" />
        ))}
      </StatusRegion>
    );
  }
  if (documents.isError) {
    return (
      <Banner
        tone="error"
        title="Couldn't load your library"
        action={
          <Button size="sm" onClick={() => void documents.refetch()}>
            Retry
          </Button>
        }
      >
        {describeError(documents.error)}
      </Banner>
    );
  }
  const list: DocumentSummary[] = documents.data;
  if (list.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border-2 border-dashed border-line-strong bg-surface/60">
        <EmptyState
          icon={<BookOpen size={26} />}
          title="Drop a document here to start listening"
          actions={emptyActions}
        >
          PDF, Word (DOCX), EPUB, Kindle (MOBI), FB2, HTML, Markdown and plain text, up to 25 MB, or
          a web page by its address. Text is extracted on this computer; scanned PDFs without a text
          layer aren't supported yet. Or start with one of the books that come with TTSNative.
        </EmptyState>
      </div>
    );
  }
  const recent = view.kind === 'all' ? list.find(isResumable) : undefined;
  const folderList = folders.data ?? [];
  const collectionList = collections.data ?? [];
  return (
    <div className="flex gap-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        <LibraryRail
          view={view}
          documents={list}
          folders={folderList}
          collections={collectionList}
        />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-4 lg:hidden">
          <RailSelect view={view} folders={folderList} collections={collectionList} />
        </div>
        {recent ? (
          <ContinueCard
            id={recent.id}
            title={recent.title}
            percent={recent.progress.percent}
            facts={documentFacts(recent).join(' · ')}
          />
        ) : null}
        <LibraryList
          documents={selectDocuments(list, view)}
          view={view}
          folders={folderList}
          collections={collectionList}
          total={list.length}
        />
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const documents = useDocuments();
  const intake = useDocumentIntake();
  const paste = usePasteText();
  const navigate = useNavigate();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [webOpen, setWebOpen] = useState(false);

  const trySample = () =>
    paste.mutate(
      { text: SAMPLE_TEXT, title: SAMPLE_TITLE },
      { onSuccess: (doc) => void navigate(`/read/${doc.id}`) },
    );

  return (
    <DropTarget
      onFile={intake.submit}
      className="mx-auto min-h-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10"
    >
      <PageHeader
        title="Library"
        description="Documents stay on this computer. Pick up exactly where you left off."
        actions={
          <UploadButtons
            onFile={intake.submit}
            onPaste={() => setPasteOpen(true)}
            onWebPage={() => setWebOpen(true)}
          />
        }
      />
      <LibraryTabs current="library" />
      <DefaultVoicesBanner />
      <UploadStatus
        uploading={intake.uploading}
        error={intake.error}
        onDismiss={intake.clearError}
      />
      {paste.isError ? (
        <Banner tone="error" className="mb-6">
          {describeError(paste.error)}
        </Banner>
      ) : null}
      <LibraryContent
        documents={documents}
        emptyActions={
          <>
            <UploadButtons
              onFile={intake.submit}
              onPaste={() => setPasteOpen(true)}
              onWebPage={() => setWebOpen(true)}
            />
            <Link to="/explore" className={buttonClasses('secondary')}>
              <BookMarked size={16} /> Browse the included books
            </Link>
            <Button
              variant="ghost"
              icon={<Sparkles size={16} />}
              onClick={trySample}
              loading={paste.isPending}
            >
              Try a sample
            </Button>
          </>
        }
      />
      <PasteTextDialog open={pasteOpen} onOpenChange={setPasteOpen} />
      <WebPageDialog open={webOpen} onOpenChange={setWebOpen} />
    </DropTarget>
  );
}
