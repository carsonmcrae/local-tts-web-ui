// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The state of one export and what can be done with it, shared by the export dialog and
 *   the Exports page.
 * Scope: Running (progress and the sentence count, announced politely, with Pause and Cancel);
 *   paused, interrupted or failed (what is saved, Resume and Cancel, and a kind explanation when
 *   M4B needs ffmpeg); canceled; and finished (Download, Send to Audiobookshelf, and Delete on the
 *   Exports page). Cancel and Delete ask first, because they discard work.
 * Does NOT belong: Starting an export (ExportDialog) or the list itself (ExportsPage).
 */
import { Download, Pause, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useDeleteExport, useExportAction } from '@/api/exportQueries';
import { isJobActive } from '@/api/queries';
import type { JobOut } from '@/api/types';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Banner, ProgressBar } from '@/components/ui/Feedback';
import { onThisComputer } from '@/features/lan/LanIndicator';
import { formatBytes, formatDuration, pluralize } from '@/lib/format';
import { EXPORT_HELP_URL, exportResult, isSingleAudioFile, savedText, TOUCH } from './exportText';
import { SendToShelf } from './SendToShelf';

interface SavedWork {
  savedSentences: number;
  sentences: number;
}

interface ExportStatusProps {
  job: JobOut;
  /** What a stopped export has saved, when the caller knows (the Exports page shows it itself). */
  saved?: SavedWork | undefined;
  /** Called with the job a resume answered with: the same export carries on. */
  onResumed?: ((job: JobOut) => void) | undefined;
  /** Offer Delete for a finished export's file (the Exports page). */
  deletable?: boolean;
  /** The finished file was deleted earlier (its folder is empty). */
  removed?: boolean;
}

function Actions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

function Problem({ error }: Readonly<{ error: unknown }>) {
  return error ? (
    <p role="alert" className="mt-2 font-medium text-danger">
      {describeError(error)}
    </p>
  ) : null;
}

function CancelExport({ job, saved }: Readonly<{ job: JobOut; saved?: SavedWork | undefined }>) {
  const cancel = useExportAction('cancel');
  const [open, setOpen] = useState(false);
  const running = isJobActive(job);
  const what = saved?.savedSentences
    ? `This discards ${pluralize(saved.savedSentences, 'saved sentence')}.`
    : 'This discards the sentences saved so far.';
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className={TOUCH}>
        Cancel export
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this export?"
        description={
          <>
            {what} {running ? 'To keep them for later, pause instead.' : "This can't be undone."}
            <Problem error={cancel.error} />
          </>
        }
        confirmLabel="Cancel export"
        cancelLabel="Keep it"
        busy={cancel.isPending}
        onConfirm={() => cancel.mutate(job.id, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

function RunningExport({ job }: Readonly<{ job: JobOut }>) {
  const pause = useExportAction('pause');
  // The export stops after the sentence it is working on; until then the job still runs.
  const pausing = pause.isPending || pause.isSuccess;
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={job.progress} label="Export progress" />
      <p aria-live="polite" className="text-sm text-muted">
        {pausing ? 'Pausing…' : job.message}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Pause size={14} />}
          loading={pausing}
          onClick={() => pause.mutate(job.id)}
          className={TOUCH}
        >
          Pause
        </Button>
        {onThisComputer() ? <CancelExport job={job} /> : null}
      </div>
      <Problem error={pause.error} />
    </div>
  );
}

const STOPPED_COPY: Record<string, { title: string; text: string }> = {
  paused: { title: 'Export paused', text: 'Resume carries on from the saved sentences.' },
  interrupted: {
    title: 'Export interrupted',
    text: 'The app closed before it finished. Resume carries on from the saved sentences.',
  },
};

/** Why an M4B export needs ffmpeg and what to do; `resumable` when its sentences are saved. */
export function FfmpegHelp({ resumable }: Readonly<{ resumable: boolean }>) {
  return (
    <>
      <p>
        ffmpeg is a free tool that turns the audio into an audiobook file, and this computer
        doesn&apos;t have it yet.{' '}
        {resumable
          ? 'Your sentences are saved: install ffmpeg, restart TTSNative and press Resume.'
          : 'Install ffmpeg, restart TTSNative and try again.'}{' '}
        Or export MP3 instead.
      </p>
      <a
        href={EXPORT_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block font-medium text-accent-text underline underline-offset-2"
      >
        How to install ffmpeg (Exporting audio help)
      </a>
    </>
  );
}

function StoppedExport({ job, saved, onResumed }: Readonly<ExportStatusProps>) {
  const resume = useExportAction('resume');
  const ffmpeg = job.status === 'failed' && job.errorCode === 'ffmpeg_missing';
  // A failure explains itself in its message; a pause or a closed app is explained here.
  const copy = STOPPED_COPY[job.status] ?? { title: 'Export failed', text: job.message };
  const tone = job.status === 'failed' && !ffmpeg ? 'error' : 'warning';
  return (
    <Banner tone={tone} title={ffmpeg ? 'M4B needs ffmpeg' : copy.title}>
      {ffmpeg ? <FfmpegHelp resumable /> : <p>{copy.text}</p>}
      {saved ? <p className="mt-1">{savedText(saved.savedSentences, saved.sentences)}.</p> : null}
      <Actions>
        <Button
          size="sm"
          variant="primary"
          icon={<RotateCcw size={14} />}
          loading={resume.isPending}
          onClick={() => resume.mutate(job.id, { onSuccess: (resumed) => onResumed?.(resumed) })}
          className={TOUCH}
        >
          Resume
        </Button>
        {onThisComputer() ? <CancelExport job={job} saved={saved} /> : null}
      </Actions>
      <Problem error={resume.error} />
    </Banner>
  );
}

function DeleteExport({ job }: Readonly<{ job: JobOut }>) {
  const remove = useDeleteExport();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 size={14} />}
        onClick={() => setOpen(true)}
        className={TOUCH}
      >
        Delete file
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete the exported file?"
        description={
          <>
            It is removed from this computer. Copies you already downloaded are kept.
            <Problem error={remove.error} />
          </>
        }
        confirmLabel="Delete file"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(job.id, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

function FinishedExport({ job, deletable, removed }: Readonly<ExportStatusProps>) {
  const result = exportResult(job);
  if (removed || !result) {
    return (
      <Banner title="File deleted">This export&apos;s file was removed from this computer.</Banner>
    );
  }
  return (
    <Banner tone="success" title="Your audio is ready">
      <p className="break-words">
        {result.filename} · {formatBytes(result.sizeBytes)} · {formatDuration(result.durationS)}
      </p>
      <Actions>
        <a
          href={`/api/exports/${job.id}/download`}
          download
          className={buttonClasses('primary', 'sm', TOUCH)}
        >
          <Download size={15} /> Download
        </a>
        {onThisComputer() && isSingleAudioFile(result.filename) ? (
          <SendToShelf exportId={job.id} />
        ) : null}
        {onThisComputer() && deletable ? <DeleteExport job={job} /> : null}
      </Actions>
    </Banner>
  );
}

export function ExportStatus(props: Readonly<ExportStatusProps>) {
  const { job } = props;
  if (isJobActive(job)) return <RunningExport job={job} />;
  if (job.status === 'succeeded') return <FinishedExport {...props} />;
  if (job.status === 'canceled') {
    return <Banner title="Export canceled">Its saved sentences were discarded.</Banner>;
  }
  return <StoppedExport {...props} />;
}
