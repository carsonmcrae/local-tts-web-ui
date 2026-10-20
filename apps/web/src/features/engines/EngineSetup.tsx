// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Install, monitor and remove speech engines from anywhere in the UI.
 * Scope: `EnginePanel` (status, hardware advice, install options with download/disk sizes, live
 *   progress with cancel, failure recovery, removal, a one-click update when the installed runtime
 *   was built from an older lock, and a repair when model files are missing, incomplete or fail
 *   their checksum) and `DefaultVoicesBanner` shown when the default Kokoro model can't be used.
 * Does NOT belong: Engine logic (server) or voice selection.
 */
import { Cpu, Download, HardDrive, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '@/api/client';
import {
  isJobActive,
  useEngines,
  useInstallEngine,
  useJob,
  useEngineJob,
  useUninstallEngine,
} from '@/api/queries';
import type { EngineInfo, InstallOption, JobOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, Banner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { JobProgress } from '@/features/jobs/JobProgress';
import { formatBytes } from '@/lib/format';

type JobKind = 'install' | 'update' | 'repair';
/** Updates and repairs run as install jobs (shared progress, cancel and status) flagged in the payload. */
function jobKind(job: JobOut | undefined): JobKind {
  if (job?.payload.update === true) return 'update';
  return job?.payload.repair === true ? 'repair' : 'install';
}
const VERB: Record<JobKind, { doing: string; done: string; noun: string }> = {
  install: { doing: 'Installing', done: 'is ready', noun: 'Installation' },
  update: { doing: 'Updating', done: 'is up to date', noun: 'Update' },
  repair: { doing: 'Repairing', done: 'is repaired', noun: 'Repair' },
};

function useEngineInstall(engine: EngineInfo) {
  const install = useInstallEngine();
  const update = useEngineJob('update');
  const repair = useEngineJob('repair');
  const started = repair.data ?? update.data ?? install.data;
  const job = useJob(started?.id ?? engine.installJobId);
  const engines = useEngines();
  const toast = useToast();
  const notified = useRef<string | null>(null);
  const finished = job.data && !isJobActive(job.data) ? job.data : undefined;
  const refetch = engines.refetch;
  useEffect(() => {
    if (!finished || notified.current === finished.id) return;
    notified.current = finished.id;
    void refetch();
    const verb = VERB[jobKind(finished)];
    if (finished.status === 'succeeded') toast.notify('success', `${engine.name} ${verb.done}`);
    if (finished.status === 'failed')
      toast.notify('error', `${engine.name} ${jobKind(finished)} failed`, finished.message);
  }, [finished, refetch, toast, engine.name]);
  return { install, update, repair, job: job.data };
}

function StatusBadge({ engine, job }: Readonly<{ engine: EngineInfo; job: JobOut | undefined }>) {
  if (engine.status === 'ready' && engine.updateAvailable)
    return <Badge tone="warning">Update available</Badge>;
  if (engine.status === 'ready') return <Badge tone="success">Installed</Badge>;
  if (engine.status === 'installing')
    return <Badge tone="accent">{VERB[jobKind(job)].doing}</Badge>;
  if (engine.status === 'needs_repair') return <Badge tone="danger">Needs repair</Badge>;
  if (engine.status === 'error') return <Badge tone="danger">Needs attention</Badge>;
  return <Badge>{engine.optional ? 'Optional' : 'Not installed'}</Badge>;
}

function storageNote(
  engine: EngineInfo,
  chosen: InstallOption | undefined,
  installed: boolean,
): string {
  if (installed) {
    const device = engine.device ? ` · running on ${engine.device.toUpperCase()}` : '';
    return `Using ${formatBytes(engine.installedBytes)}${device}`;
  }
  return `Needs about ${formatBytes(chosen?.diskBytes ?? 0)} of disk space`;
}

function EngineFacts({
  engine,
  chosen,
  installed,
}: Readonly<{ engine: EngineInfo; chosen: InstallOption | undefined; installed: boolean }>) {
  const storage = storageNote(engine, chosen, installed);
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="sr-only">Hardware</dt>
          <dd className="flex gap-2 text-muted">
            <Cpu size={15} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />
            {engine.hardwareNote}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Storage</dt>
          <dd className="flex gap-2 text-muted">
            <HardDrive size={15} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />
            {storage}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-subtle">License: {engine.license}</p>
    </>
  );
}

function InstallOptions({
  engine,
  value,
  onChange,
}: Readonly<{ engine: EngineInfo; value: string | undefined; onChange: (id: string) => void }>) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Choose how to run it</legend>
      {engine.installOptions.map((item) => (
        <label
          key={item.id}
          className={cn(
            'flex cursor-pointer flex-col gap-1 rounded-[var(--radius-md)] border p-3 text-sm transition-colors',
            value === item.id
              ? 'border-accent bg-accent-soft'
              : 'border-line hover:border-line-strong',
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <input
              type="radio"
              name={`option-${engine.id}`}
              value={item.id}
              checked={value === item.id}
              onChange={() => onChange(item.id)}
              className="accent-[var(--accent)]"
            />
            {item.label}
            {item.recommended ? <Badge tone="accent">Recommended</Badge> : null}
          </span>
          <span className="text-[13px] text-muted">{item.description}</span>
          <span className="text-xs text-subtle">
            Download ≈ {formatBytes(item.downloadBytes)} · Disk ≈ {formatBytes(item.diskBytes)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Progress of the running install/update job, why the last one failed, or why it couldn't start. */
function JobFeedback({
  job,
  active,
  engineName,
  requestError,
}: Readonly<{
  job: JobOut | undefined;
  active: boolean;
  engineName: string;
  requestError: Error | null;
}>) {
  return (
    <>
      {active && job ? (
        <JobProgress job={job} label={`${VERB[jobKind(job)].doing} ${engineName}`} />
      ) : null}
      {job?.status === 'failed' ? (
        <Banner tone="error" title={`${VERB[jobKind(job)].noun} failed`}>
          {job.message}
        </Banner>
      ) : null}
      {requestError ? <Banner tone="error">{describeError(requestError)}</Banner> : null}
    </>
  );
}

type EngineJob = ReturnType<typeof useEngineJob>;

/** A repair when model files are damaged, or an update when the runtime was built from an older lock. */
function MaintenanceNotice({
  engine,
  update,
  repair,
}: Readonly<{ engine: EngineInfo; update: EngineJob; repair: EngineJob }>) {
  const repairing = engine.status === 'needs_repair';
  if (!repairing && !(engine.status === 'ready' && engine.updateAvailable)) return null;
  const action = repairing ? repair : update;
  return (
    <Banner
      tone={repairing ? 'error' : 'warning'}
      title={repairing ? 'Model files need repair' : 'Update available'}
    >
      {repairing
        ? `${engine.statusMessage} Your documents, recordings, voices and other models aren't touched.`
        : `This version of the app ships updated runtime packages for ${engine.name}, such as security fixes. Only the changed packages are downloaded. Your voices and model files are kept, and a failed update doesn't remove the current installation.`}
      <div className="mt-3">
        <Button
          size="sm"
          variant="primary"
          icon={repairing ? <Wrench size={15} /> : <RefreshCw size={15} />}
          onClick={() => action.mutate(engine.id)}
          loading={action.isPending}
        >
          {repairing ? 'Repair' : 'Update'} {engine.name}
        </Button>
      </div>
    </Banner>
  );
}

function RemoveEngine({ engine }: Readonly<{ engine: EngineInfo }>) {
  const uninstall = useUninstallEngine();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${engine.name}?`}
        description="The model files are deleted and cached audio is cleared. Your documents and voice recordings are kept. You can reinstall at any time."
        confirmLabel="Remove"
        busy={uninstall.isPending}
        onConfirm={() => uninstall.mutate(engine.id, { onSettled: () => setOpen(false) })}
      />
    </>
  );
}

export function EnginePanel({ engine }: Readonly<{ engine: EngineInfo }>) {
  const { install, update, repair, job } = useEngineInstall(engine);
  const recommended =
    engine.installOptions.find((option) => option.recommended) ?? engine.installOptions[0];
  const [option, setOption] = useState(recommended?.id);
  const active = isJobActive(job) || engine.status === 'installing';
  const present = engine.status === 'ready' || engine.status === 'needs_repair';
  const installable = !present && !active;
  const chosen = engine.installOptions.find((item) => item.id === option);

  return (
    <article className="flex flex-col gap-4" aria-labelledby={`engine-${engine.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`engine-${engine.id}`} className="font-semibold">
              {engine.name}
            </h3>
            <StatusBadge engine={engine} job={job} />
            {engine.supportsCloning ? <Badge tone="accent">Voice cloning</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">{engine.description}</p>
        </div>
        {present ? <RemoveEngine engine={engine} /> : null}
      </div>
      <EngineFacts
        engine={engine}
        chosen={chosen}
        installed={present || (active && jobKind(job) !== 'install')}
      />
      {installable && engine.installOptions.length > 1 ? (
        <InstallOptions engine={engine} value={option} onChange={setOption} />
      ) : null}
      {active ? null : <MaintenanceNotice engine={engine} update={update} repair={repair} />}
      <JobFeedback
        job={job}
        active={active}
        engineName={engine.name}
        requestError={install.error ?? update.error ?? repair.error}
      />
      {installable ? (
        <div>
          <Button
            variant="primary"
            icon={<Download size={16} />}
            onClick={() => install.mutate({ engineId: engine.id, option })}
            loading={install.isPending}
          >
            Install {engine.name} ({formatBytes(chosen?.downloadBytes ?? 0)})
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function DefaultVoicesBanner() {
  const engines = useEngines();
  const kokoro = engines.data?.find((engine) => engine.id === 'kokoro');
  if (!kokoro || kokoro.status === 'ready') return null;
  const title =
    kokoro.status === 'needs_repair'
      ? 'Repair the voice model to keep listening'
      : 'Install the voice model to start listening';
  return (
    <Banner tone="warning" title={title} className="mb-6">
      <div className="mt-3">
        <EnginePanel engine={kokoro} />
      </div>
    </Banner>
  );
}
