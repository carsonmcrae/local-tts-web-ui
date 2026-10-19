/**
 * Purpose: Export a document (or a range of chapters) as downloadable audio.
 * Scope: Format (MP3/WAV), single file vs one file per chapter (ZIP + playlist), chapter range,
 *   live progress with cancel, resume after cancel/failure (cached sentences are reused), and the
 *   download link once ready.
 * Does NOT belong: Export assembly (server) or live playback.
 */
import { Download, FileAudio, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { api, describeError } from '@/api/client';
import { isJobActive, useCancelJob, useJob, usePreferences, useStartExport } from '@/api/queries';
import type { JobOut, SectionOut } from '@/api/types';
import { buttonClasses, Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, ProgressBar } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { formatBytes, formatDuration } from '@/lib/format';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  sections: readonly Pick<SectionOut, 'index' | 'title'>[];
  currentSection: number;
  voiceId: string;
  pace: number;
}

type Range = 'all' | 'current' | 'custom';

function JobStatus({
  job,
  onResume,
}: Readonly<{ job: JobOut; onResume: (jobId: string) => void }>) {
  const cancel = useCancelJob();
  if (isJobActive(job)) {
    return (
      <div className="flex flex-col gap-3">
        <ProgressBar value={job.progress} label="Export progress" />
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span aria-live="polite">{job.message}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => cancel.mutate(job.id)}
            loading={cancel.isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  if (job.status === 'succeeded' && job.result) {
    const result = job.result as { filename: string; sizeBytes: number; durationS: number };
    return (
      <Banner
        tone="success"
        title="Your audio is ready"
        action={
          <a
            href={`/api/exports/${job.id}/download`}
            download
            className={buttonClasses('primary', 'sm')}
          >
            <Download size={15} /> Download
          </a>
        }
      >
        {result.filename} · {formatBytes(result.sizeBytes)} · {formatDuration(result.durationS)}
      </Banner>
    );
  }
  return (
    <Banner
      tone={job.status === 'failed' ? 'error' : 'warning'}
      title={job.status === 'failed' ? 'Export failed' : 'Export stopped'}
      action={
        <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => onResume(job.id)}>
          Resume
        </Button>
      }
    >
      {job.message} Sentences already generated are reused when you resume.
    </Banner>
  );
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
  const [chosenFormat, setChosenFormat] = useState<'mp3' | 'wav' | null>(null);
  const [layout, setLayout] = useState<'single' | 'chapters'>('single');
  const [range, setRange] = useState<Range>('all');
  const [first, setFirst] = useState(0);
  const [last, setLast] = useState(Math.max(sections.length - 1, 0));
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const start = useStartExport();
  const job = useJob(jobId);

  const format = chosenFormat ?? preferences.data?.exportFormat ?? 'mp3';

  const bounds = (): [number | null, number | null] => {
    if (range === 'current') return [currentSection, currentSection];
    if (range === 'custom') return [Math.min(first, last), Math.max(first, last)];
    return [null, null];
  };

  const begin = () => {
    const [firstSection, lastSection] = bounds();
    setErrorMessage(null);
    start.mutate(
      { documentId, voiceId, pace, format, layout, firstSection, lastSection },
      {
        onSuccess: (created) => setJobId(created.id),
        onError: (error) => setErrorMessage(describeError(error)),
      },
    );
  };

  const resume = (stoppedJobId: string) => {
    api<JobOut>(`/api/exports/${stoppedJobId}/resume`, { method: 'POST' })
      .then((created) => setJobId(created.id))
      .catch((error: unknown) => setErrorMessage(describeError(error)));
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
            onClick={begin}
            loading={start.isPending}
            disabled={active}
          >
            Start export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Format"
            hint={format === 'mp3' ? 'Smaller files, plays everywhere.' : 'Lossless, larger files.'}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={format}
                onChange={(event) => setChosenFormat(event.target.value as 'mp3' | 'wav')}
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
              </Select>
            )}
          </Field>
          <Field
            label="Files"
            hint={
              layout === 'chapters'
                ? 'A ZIP with one file per chapter and a playlist.'
                : 'One continuous file.'
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={layout}
                onChange={(event) => setLayout(event.target.value as 'single' | 'chapters')}
              >
                <option value="single">Single file</option>
                <option value="chapters">One file per chapter</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="What to export">
          {({ id }) => (
            <Select
              id={id}
              value={range}
              onChange={(event) => setRange(event.target.value as Range)}
            >
              <option value="all">Whole document ({sections.length} sections)</option>
              <option value="current">Current section only</option>
              <option value="custom">A range of sections</option>
            </Select>
          )}
        </Field>
        {range === 'custom' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['From', first, setFirst],
                ['To', last, setLast],
              ] as const
            ).map(([label, value, setter]) => (
              <Field key={label} label={label}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={value}
                    onChange={(event) => setter(Number(event.target.value))}
                  >
                    {sections.map((section) => (
                      <option key={section.index} value={section.index}>
                        {section.index + 1}. {section.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        ) : null}
        {errorMessage ? <Banner tone="error">{errorMessage}</Banner> : null}
        {job.data ? <JobStatus job={job.data} onResume={resume} /> : null}
      </div>
    </Dialog>
  );
}
