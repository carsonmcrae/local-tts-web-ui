/**
 * Purpose: The persistent audio player docked at the bottom of every screen.
 * Scope: Play/pause, sentence and section skipping, document-level seeking, elapsed/remaining
 *   estimates, speed, voice and export controls, loading/error states with recovery, and an
 *   aria-live status for screen readers. Collapses to a compact layout on phones.
 * Does NOT belong: Playback logic (controller.ts) or the export workflow (ExportDialog).
 */
import { Download, Keyboard, Loader2, Pause, Play, RotateCcw, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { usePreferences, useSavePreferences, useVoices } from '@/api/queries';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { OptionList, Popover } from '@/components/ui/Menu';
import { Slider } from '@/components/ui/Slider';
import { ExportDialog } from '@/features/reader/ExportDialog';
import { formatClock } from '@/lib/format';
import { usePlayer } from './PlayerProvider';
import { SHORTCUTS, SPEEDS, useShortcuts } from './useShortcuts';
import { VoicePicker } from './VoicePicker';

function ShortcutSheet({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.action} className="contents">
            <dt className="flex gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-xs">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd className="text-muted">{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export function PlayerBar() {
  const { controller, state } = usePlayer();
  const voices = useVoices();
  const preferences = usePreferences();
  const savePreferences = useSavePreferences();
  const [scrub, setScrub] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { document, segmentIndex, status, error, rate } = state;

  const persist = useCallback(
    (patch: { defaultVoiceId?: string; playbackRate?: number }) => {
      if (preferences.data) savePreferences.mutate({ ...preferences.data, ...patch });
    },
    [preferences.data, savePreferences],
  );
  const changeRate = useCallback(
    (next: number) => {
      controller.setRate(next);
      persist({ playbackRate: next });
    },
    [controller, persist],
  );
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useShortcuts(controller, { enabled: Boolean(document), onRateChange: changeRate, onHelp: openHelp });

  if (!document) return null;

  const count = Math.max(document.segmentCount, 1);
  const position = scrub ?? segmentIndex;
  const fraction = (position + (state.duration ? state.currentTime / state.duration : 0)) / count;
  const total = (document.estimatedSeconds ?? 0) / rate;
  const section = controller.sectionAt(position);
  const busy = status === 'loading';
  const playing = status === 'playing' || busy;
  const statusText =
    status === 'error'
      ? (error?.message ?? 'Playback failed.')
      : `${playing ? 'Playing' : 'Paused at'} sentence ${segmentIndex + 1} of ${count}`;

  return (
    <section aria-label="Audio player" className="border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <p className="sr-only" aria-live="polite">
        {status === 'error' ? statusText : ''}
      </p>
      {status === 'error' ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-danger-soft px-4 py-2 text-sm">
          <span>{error?.message}</span>
          {error?.code === 'engine_not_installed' ? (
            <Link to="/settings#engines" className="font-medium text-accent-text underline-offset-2 hover:underline">
              Open Settings
            </Link>
          ) : (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void controller.play()}>
              Retry
            </Button>
          )}
        </div>
      ) : null}
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 md:py-2.5">
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            to={`/read/${document.id}`}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] md:w-56 md:flex-none lg:w-64"
            aria-label={`Open ${document.title}`}
          >
            <p className="truncate text-sm font-medium">{document.title}</p>
            <p className="truncate text-xs text-muted">{section?.title ?? <>&nbsp;</>}</p>
          </Link>
          <div className="flex items-center gap-0.5 md:flex-1 md:justify-center md:gap-1">
            <IconButton label="Previous section" icon={<SkipBack size={18} />} className="hidden md:inline-flex" onClick={() => void controller.previousSection()} />
            <IconButton label="Previous sentence" icon={<StepBack size={20} />} onClick={() => void controller.previous()} />
            <IconButton
              label={playing ? 'Pause' : 'Play'}
              variant="primary"
              size="lg"
              className="rounded-full"
              onClick={() => void controller.toggle()}
              icon={busy ? <Loader2 size={22} className="animate-spin" /> : playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-px" />}
            />
            <IconButton label="Next sentence" icon={<StepForward size={20} />} onClick={() => void controller.next()} />
            <IconButton label="Next section" icon={<SkipForward size={18} />} className="hidden md:inline-flex" onClick={() => void controller.nextSection()} />
          </div>
          <div className="hidden items-center gap-0.5 md:flex md:w-56 md:justify-end lg:w-64">
            <VoicePicker
              voices={voices.data ?? []}
              value={state.voiceId}
              onChange={(voiceId) => {
                void controller.setVoice(voiceId);
                persist({ defaultVoiceId: voiceId });
              }}
            />
            <Popover
              label="Playback speed"
              align="end"
              className="w-40"
              trigger={
                <button type="button" aria-label={`Playback speed ${rate}×`} className="h-9 rounded-[var(--radius-md)] px-2.5 text-sm font-medium text-muted tabular-nums hover:bg-surface-2 hover:text-text">
                  {rate}×
                </button>
              }
            >
              <OptionList label="Playback speed" options={SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }))} value={rate} onSelect={changeRate} />
            </Popover>
            <IconButton label="Export audio" icon={<Download size={18} />} onClick={() => setExportOpen(true)} />
            <IconButton label="Keyboard shortcuts" icon={<Keyboard size={18} />} className="hidden lg:inline-flex" onClick={openHelp} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted tabular-nums">
          <span className="w-12 text-right" aria-hidden="true">
            {formatClock(fraction * total)}
          </span>
          <Slider
            label="Position in document"
            min={0}
            max={count - 1}
            value={position}
            valueText={(value) => `Sentence ${value + 1} of ${count}`}
            onChange={setScrub}
            onCommit={(value) => {
              setScrub(null);
              void controller.seek(value);
            }}
          />
          <span className="w-12" aria-hidden="true">
            -{formatClock(Math.max(total - fraction * total, 0))}
          </span>
          <div className="flex items-center md:hidden">
            <VoicePicker
              compact
              voices={voices.data ?? []}
              value={state.voiceId}
              onChange={(voiceId) => {
                void controller.setVoice(voiceId);
                persist({ defaultVoiceId: voiceId });
              }}
            />
            <button type="button" aria-label={`Playback speed ${rate}×. Change speed`} onClick={() => changeRate(SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1)} className="h-9 rounded-[var(--radius-md)] px-2 font-medium tabular-nums">
              {rate}×
            </button>
            <IconButton label="Export audio" icon={<Download size={17} />} size="sm" onClick={() => setExportOpen(true)} />
          </div>
        </div>
      </div>
      <ShortcutSheet open={helpOpen} onOpenChange={setHelpOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} documentId={document.id} sections={document.sections} currentSection={section?.index ?? 0} voiceId={state.voiceId} pace={state.pace} />
    </section>
  );
}
