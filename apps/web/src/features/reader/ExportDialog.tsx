// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Export a document (or a range of chapters) as audio, an M4B audiobook or a read-along
 *   EPUB.
 * Scope: Holds the choices (ExportOptions) and the audiobook details (AudiobookDetails), saves
 *   unsaved details and starts the export once (a double click never starts two), then follows the
 *   job (ExportStatus: progress, pause, resume, cancel, download, Audiobookshelf) and links to the
 *   Exports page, where every export can be found again after the app restarts.
 * Does NOT belong: Export assembly (server), the actions on one export (ExportStatus) or live
 *   playback.
 */
import { FileAudio } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { useExportDetail, useStartExport } from '@/api/exportQueries';
import { isJobActive, useJob, usePreferences } from '@/api/queries';
import type { ExportFormat, SectionOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { ExportStatus, FfmpegHelp } from '@/features/exports/ExportStatus';
import { RESUMABLE } from '@/features/exports/exportText';
import { AudiobookDetails, useDetailsDraft } from './AudiobookDetails';
import type { ExportChoices } from './ExportOptions';
import { choicesToRequest, ExportOptions } from './ExportOptions';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  sections: readonly Pick<SectionOut, 'index' | 'title'>[];
  currentSection: number;
  voiceId: string;
  pace: number;
}

type Choices = Omit<ExportChoices, 'format'> & { format: ExportFormat | null };

function StartProblem({ error }: Readonly<{ error: unknown }>) {
  if (error instanceof ApiError && error.code === 'ffmpeg_missing') {
    return (
      <Banner tone="warning" title="M4B needs ffmpeg">
        <FfmpegHelp resumable={false} />
      </Banner>
    );
  }
  return <Banner tone="error">{describeError(error)}</Banner>;
}

export function ExportDialog({
  open,
  onOpenChange,
  documentId,
  sections,
  currentSection,
  voiceId,
  pace,
}: Readonly<ExportDialogProps>) {
  const preferences = usePreferences();
  const [choices, setChoices] = useState<Choices>({
    format: null, // until chosen, the saved preference
    layout: 'single',
    captions: false,
    range: 'all',
    first: 0,
    last: Math.max(sections.length - 1, 0),
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const details = useDetailsDraft(documentId, open && detailsOpen);
  const [jobId, setJobId] = useState<string | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const startingNow = useRef(false); // guards the moment before `starting` re-renders
  const start = useStartExport();
  const job = useJob(jobId);
  const stopped = job.data ? RESUMABLE.has(job.data.status) : false;
  const saved = useExportDetail(jobId, stopped);

  const current: ExportChoices = {
    ...choices,
    format: choices.format ?? preferences.data?.exportFormat ?? 'mp3',
  };

  const begin = async () => {
    if (startingNow.current) return;
    startingNow.current = true;
    setStarting(true);
    setProblem(null);
    try {
      await details.flush();
      const created = await start.mutateAsync({
        documentId,
        voiceId,
        pace,
        ...choicesToRequest(current, currentSection),
        useCover: true,
      });
      setJobId(created.id);
    } catch (error) {
      setProblem(error);
    } finally {
      startingNow.current = false;
      setStarting(false);
    }
  };

  const active = isJobActive(job.data);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export audio"
      description="Generate the whole document (or part of it) with the current voice and download it."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>
            {active ? 'Keep running in background' : 'Close'}
          </Button>
          <Button
            variant="primary"
            icon={<FileAudio size={16} />}
            onClick={() => void begin()}
            loading={starting}
            disabled={active}
          >
            Start export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ExportOptions
          choices={current}
          onChange={(change) => setChoices((before) => ({ ...before, ...change }))}
          sections={sections}
        />
        <AudiobookDetails
          documentId={documentId}
          state={details}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
        {problem ? <StartProblem error={problem} /> : null}
        {job.data ? (
          <ExportStatus
            job={job.data}
            saved={stopped ? saved.data : undefined}
            onResumed={(resumed) => setJobId(resumed.id)}
          />
        ) : null}
        {jobId ? (
          <p className="text-[13px] text-muted">
            Every export is also listed on{' '}
            <Link
              to="/exports"
              onClick={() => onOpenChange(false)}
              className="font-medium text-accent-text underline underline-offset-2"
            >
              the Exports page
            </Link>
            , even after the app restarts.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
