// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings sections describing the local system: engines, storage, privacy and diagnostics.
 * Scope: Engine install/remove panels, disk usage by category with cache clearing, the privacy
 *   posture (and whether the server is exposed to the network), version information, who made the
 *   app (project, author, licence and a link to its source) and a copyable diagnostics report.
 * Does NOT belong: User preferences (PreferenceSections).
 */
import { ClipboardCopy, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useClearCache, useEngines, useSystem } from '@/api/queries';
import type { SystemInfo } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Banner, ProgressBar, Skeleton } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { formatBytes } from '@/lib/format';
import { AUTHOR, COPYRIGHT, HOMEPAGE, LICENSE, PROJECT } from '@/lib/provenance';

declare const __APP_VERSION__: string;

export function EnginesSection() {
  const engines = useEngines();
  return (
    <Section
      id="engines"
      title="Engines & models"
      description="Model files are downloaded from pinned sources and verified with SHA-256 before use."
    >
      {engines.isPending ? <Skeleton className="h-32" /> : null}
      {engines.isError ? <Banner tone="error">{describeError(engines.error)}</Banner> : null}
      <div className="flex flex-col divide-y divide-line">
        {(engines.data ?? []).map((engine) => (
          <div key={engine.id} className="py-5 first:pt-0 last:pb-0">
            <EnginePanel engine={engine} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function StorageSection() {
  const system = useSystem();
  const clear = useClearCache();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const storage = system.data?.storage;
  const rows: [string, number][] = storage
    ? [
        ['Voice models', storage.modelsBytes],
        ['Audio cache', storage.audioCacheBytes],
        ['Voice recordings', storage.voicesBytes],
        ['Exports', storage.exportsBytes],
        ['Library database', storage.databaseBytes],
      ]
    : [];
  return (
    <Section
      id="storage"
      title="Storage"
      description={storage ? `Data folder: ${storage.dataDir}` : undefined}
    >
      {storage ? (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {rows.map(([label, bytes]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-line py-1.5">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{formatBytes(bytes)}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="mb-1.5 flex justify-between text-[13px] text-muted">
              <span>Audio cache</span>
              <span>
                {formatBytes(storage.audioCacheBytes)} of{' '}
                {formatBytes(storage.audioCacheLimitBytes)} limit
              </span>
            </div>
            <ProgressBar
              value={storage.audioCacheBytes / Math.max(storage.audioCacheLimitBytes, 1)}
              label="Audio cache usage"
            />
            <p className="mt-2 text-[13px] text-muted">
              Older audio is removed automatically when the cache is full.{' '}
              {formatBytes(storage.freeBytes)} free on this disk.
            </p>
          </div>
          <div>
            <Button icon={<Trash2 size={15} />} onClick={() => setConfirm(true)}>
              Clear audio cache
            </Button>
          </div>
        </div>
      ) : (
        <Skeleton className="h-28" />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear the audio cache?"
        description="Generated audio is deleted. Documents, voices and models are kept; audio is regenerated as you listen."
        confirmLabel="Clear cache"
        busy={clear.isPending}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: (result) => {
              setConfirm(false);
              toast.notify(
                'success',
                'Audio cache cleared',
                `${result.removedEntries} clips removed.`,
              );
            },
          })
        }
      />
    </Section>
  );
}

export function PrivacySection() {
  const system = useSystem();
  return (
    <Section id="privacy" title="Privacy">
      <ul className="flex flex-col gap-2.5 text-sm">
        {[
          'No accounts, analytics or telemetry.',
          'Documents, recordings and generated audio are processed and stored only on this computer.',
          'The only network requests are the model downloads you start yourself, books you send to your own Audiobookshelf, and your browser loading this page.',
          'Once models are installed, everything works offline.',
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-success" />
            {line}
          </li>
        ))}
      </ul>
      {system.data?.networkExposed ? (
        <Banner tone="warning" className="mt-4" title="Network access is on">
          This server accepts connections from other devices on your network (access token
          required). Restart without --allow-network to turn it off.
        </Banner>
      ) : null}
    </Section>
  );
}

export function diagnosticsReport(info: SystemInfo, webVersion: string): string {
  const gpus = info.gpus.map((gpu) => `${gpu.vendor} ${gpu.name}`).join(', ') || 'none detected';
  return [
    `${PROJECT} web ${webVersion} / server ${info.version}`,
    `Python ${info.python} on ${info.platform} (${info.machine}), ${info.cpuCores} logical CPUs`,
    `Memory: ${formatBytes(info.memoryAvailableBytes)} free of ${formatBytes(info.memoryTotalBytes)}`,
    `GPUs: ${gpus}`,
    `ONNX Runtime providers: ${info.onnxProviders.join(', ')}`,
    `Disk free: ${formatBytes(info.storage.freeBytes)}; models ${formatBytes(info.storage.modelsBytes)}; cache ${formatBytes(info.storage.audioCacheBytes)}`,
    `Network exposed: ${info.networkExposed ? 'yes' : 'no'}`,
  ].join('\n');
}

export function AboutSection() {
  const system = useSystem();
  const toast = useToast();
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  const info = system.data;
  return (
    <Section id="about" title="About & diagnostics">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {(
          [
            ['App version', version],
            ['Server version', info?.version ?? '…'],
            ['Runtime', info ? `Python ${info.python}` : '…'],
            [
              'System',
              info
                ? `${info.platform} · ${info.cpuCores} CPUs · ${formatBytes(info.memoryTotalBytes)} RAM`
                : '…',
            ],
            [
              'GPU',
              info
                ? info.gpus.map((gpu) => gpu.name).join(', ') || 'None detected (CPU mode)'
                : '…',
            ],
            ['Made by', `${PROJECT} by ${AUTHOR}`],
            ['License', `${LICENSE}, ${COPYRIGHT}. Model licenses are listed with each engine.`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col border-b border-line py-1.5">
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {info ? (
        <Button
          className="mt-4"
          icon={<ClipboardCopy size={15} />}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(diagnosticsReport(info, version))
              .then(() =>
                toast.notify(
                  'success',
                  'Diagnostics copied',
                  'Contains no documents or personal data.',
                ),
              )
              .catch(() => toast.notify('error', 'Copy failed'))
          }
        >
          Copy diagnostics
        </Button>
      ) : null}
      <p className="mt-4 text-[13px] text-muted">
        Source code, credits and how to attribute this project:{' '}
        <a
          href={HOMEPAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-text underline-offset-2 hover:underline"
        >
          {HOMEPAGE.replace('https://', '')}
        </a>
      </p>
    </Section>
  );
}
