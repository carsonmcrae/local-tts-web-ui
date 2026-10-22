// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The library — the app's home screen.
 * Scope: Upload/paste/web page entry points, drag-and-drop anywhere on the page, a "continue listening" card
 *   for the most recent document, the searchable, sortable document list, a one-click sample, and
 *   loading/empty/error states.
 * Does NOT belong: Reading view (ReaderPage).
 */
import { BookOpen, PlayCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { describeError } from '@/api/client';
import { useDocuments, usePasteText } from '@/api/queries';
import type { DocumentSummary, ReadingProgress } from '@/api/types';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Banner, EmptyState, ProgressBar, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Layout';
import { DefaultVoicesBanner } from '@/features/engines/EngineSetup';
import { documentFacts } from './DocumentCard';
import { LibraryList } from './LibraryList';
import { SAMPLE_TEXT, SAMPLE_TITLE } from './sample';
import {
  DropTarget,
  PasteTextDialog,
  UploadButtons,
  UploadStatus,
  useDocumentIntake,
} from './UploadArea';
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

type Resumable = DocumentSummary & { progress: ReadingProgress };

/** A document that was started but not finished (the "continue listening" candidate). */
function isResumable(doc: DocumentSummary): doc is Resumable {
  return Boolean(doc.progress && doc.progress.percent < 99.5);
}

function LibraryContent({
  documents,
  emptyActions,
}: Readonly<{ documents: ReturnType<typeof useDocuments>; emptyActions: ReactNode }>) {
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
  const list = documents.data;
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
          layer aren't supported yet.
        </EmptyState>
      </div>
    );
  }
  const recent = list.find(isResumable);
  return (
    <>
      {recent ? (
        <ContinueCard
          id={recent.id}
          title={recent.title}
          percent={recent.progress.percent}
          facts={documentFacts(recent).join(' · ')}
        />
      ) : null}
      <LibraryList documents={list} />
    </>
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
      className="mx-auto min-h-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10"
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
