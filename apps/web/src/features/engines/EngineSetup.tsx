/**
 * Purpose: Install, monitor and remove speech engines from anywhere in the UI.
 * Scope: `EnginePanel` (status, hardware advice, install options with download/disk sizes, live
 *   progress with cancel, failure recovery, removal) and `DefaultVoicesBanner` shown when the default
 *   Kokoro model is missing.
 * Does NOT belong: Engine logic (server) or voice selection.
 */
import { Cpu, Download, HardDrive, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '@/api/client';
import { isJobActive, useCancelJob, useEngines, useInstallEngine, useJob, useUninstallEngine } from '@/api/queries';
import type { EngineInfo } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, Banner, ProgressBar } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

function useEngineInstall(engine: EngineInfo) {
  const install = useInstallEngine();
  const job = useJob(install.data?.id ?? engine.installJobId);
  const cancel = useCancelJob();
  const engines = useEngines();
  const toast = useToast();
  const notified = useRef<string | null>(null);
  const finished = job.data && !isJobActive(job.data) ? job.data : undefined;
  const refetch = engines.refetch;
  useEffect(() => {
    if (!finished || notified.current === finished.id) return;
    notified.current = finished.id;
    void refetch();
    if (finished.status === 'succeeded') toast.notify('success', `${engine.name} is ready`);
    if (finished.status === 'failed') toast.notify('error', `${engine.name} install failed`, finished.message);
  }, [finished, refetch, toast, engine.name]);
  return { install, job: job.data, cancel };
}

function StatusBadge({ engine }: Readonly<{ engine: EngineInfo }>) {
  if (engine.status === 'ready') return <Badge tone="success">Installed</Badge>;
  if (engine.status === 'installing') return <Badge tone="accent">Installing</Badge>;
  if (engine.status === 'error') return <Badge tone="danger">Needs attention</Badge>;
  return <Badge>{engine.optional ? 'Optional' : 'Not installed'}</Badge>;
}

export function EnginePanel({ engine }: Readonly<{ engine: EngineInfo }>) {
  const { install, job, cancel } = useEngineInstall(engine);
  const uninstall = useUninstallEngine();
  const recommended = engine.installOptions.find((option) => option.recommended) ?? engine.installOptions[0];
  const [option, setOption] = useState(recommended?.id);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const active = isJobActive(job) || engine.status === 'installing';
  const chosen = engine.installOptions.find((item) => item.id === option);

  return (
    <article className="flex flex-col gap-4" aria-labelledby={`engine-${engine.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 id={`engine-${engine.id}`} className="font-semibold">
              {engine.name}
            </h3>
            <StatusBadge engine={engine} />
            {engine.supportsCloning ? <Badge tone="accent">Voice cloning</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">{engine.description}</p>
        </div>
        {engine.status === 'ready' ? (
          <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => setConfirmRemove(true)}>
            Remove
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        <div className="flex gap-2">
          <Cpu size={15} className="mt-0.5 shrink-0 text-subtle" />
          <div>
            <dt className="sr-only">Hardware</dt>
            <dd className="text-muted">{engine.hardwareNote}</dd>
          </div>
        </div>
        <div className="flex gap-2">
          <HardDrive size={15} className="mt-0.5 shrink-0 text-subtle" />
          <div>
            <dt className="sr-only">Storage</dt>
            <dd className="text-muted">
              {engine.status === 'ready'
                ? `Using ${formatBytes(engine.installedBytes)}${engine.device ? ` · running on ${engine.device.toUpperCase()}` : ''}`
                : `Needs about ${formatBytes(chosen?.diskBytes ?? 0)} of disk space`}
            </dd>
          </div>
        </div>
      </dl>
      <p className="text-xs text-subtle">License: {engine.license}</p>

      {engine.status !== 'ready' && !active && engine.installOptions.length > 1 ? (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Choose how to run it</legend>
          {engine.installOptions.map((item) => (
            <label
              key={item.id}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-[var(--radius-md)] border p-3 text-sm transition-colors',
                option === item.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name={`option-${engine.id}`} value={item.id} checked={option === item.id} onChange={() => setOption(item.id)} className="accent-[var(--accent)]" />
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
      ) : null}

      {active && job ? (
        <div className="flex flex-col gap-2">
          <ProgressBar value={job.progress} label={`Installing ${engine.name}`} />
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
            <span aria-live="polite" className="truncate">
              {job.message}
            </span>
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(job.id)} loading={cancel.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {job?.status === 'failed' ? <Banner tone="error" title="Installation failed">{job.message}</Banner> : null}
      {install.isError ? <Banner tone="error">{describeError(install.error)}</Banner> : null}

      {engine.status !== 'ready' && !active ? (
        <div>
          <Button variant="primary" icon={<Download size={16} />} onClick={() => install.mutate({ engineId: engine.id, option })} loading={install.isPending}>
            Install {engine.name} ({formatBytes(chosen?.downloadBytes ?? 0)})
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${engine.name}?`}
        description="The model files are deleted and cached audio is cleared. Your documents and voice recordings are kept. You can reinstall at any time."
        confirmLabel="Remove"
        busy={uninstall.isPending}
        onConfirm={() => uninstall.mutate(engine.id, { onSettled: () => setConfirmRemove(false) })}
      />
    </article>
  );
}

export function DefaultVoicesBanner() {
  const engines = useEngines();
  const kokoro = engines.data?.find((engine) => engine.id === 'kokoro');
  if (!kokoro || kokoro.status === 'ready') return null;
  return (
    <Banner tone="warning" title="Install the voice model to start listening" className="mb-6">
      <div className="mt-3">
        <EnginePanel engine={kokoro} />
      </div>
    </Banner>
  );
}
