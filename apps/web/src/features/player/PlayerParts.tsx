// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Presentational pieces of the docked player.
 * Scope: Error strip with recovery, transport buttons, speed menu, position slider with time
 *   estimates, and the keyboard-shortcut sheet. Stateless apart from local UI toggles.
 * Does NOT belong: Playback state or persistence (PlayerBar / controller).
 */
import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { OptionList, Popover } from '@/components/ui/Menu';
import { Slider } from '@/components/ui/Slider';
import { formatClock } from '@/lib/format';
import type { PlaybackController, PlayerError } from './controller';
import { SHORTCUTS, SPEEDS } from './useShortcuts';

/** Errors fixed in Settings → Engines & models rather than by retrying. */
const SETTINGS_ERRORS = new Set(['engine_not_installed', 'model_damaged']);

export function ErrorStrip({
  error,
  onRetry,
}: Readonly<{ error: PlayerError | null; onRetry: () => void }>) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-danger-soft px-4 py-2 text-sm"
      role="alert"
    >
      <span>{error?.message ?? 'Playback failed.'}</span>
      {SETTINGS_ERRORS.has(error?.code ?? '') ? (
        <Link
          to="/settings#engines"
          className="font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Open Settings
        </Link>
      ) : (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function PlayIcon({ busy, playing }: Readonly<{ busy: boolean; playing: boolean }>) {
  if (busy) return <Loader2 size={22} className="animate-spin" />;
  if (playing) return <Pause size={22} fill="currentColor" />;
  return <Play size={22} fill="currentColor" className="translate-x-px" />;
}

export function Transport({
  controller,
  busy,
  playing,
}: Readonly<{ controller: PlaybackController; busy: boolean; playing: boolean }>) {
  return (
    <div className="flex items-center gap-0.5 md:flex-1 md:justify-center md:gap-1">
      <IconButton
        label="Previous section"
        icon={<SkipBack size={18} />}
        className="hidden md:inline-flex"
        onClick={() => void controller.previousSection()}
      />
      <IconButton
        label="Previous sentence"
        icon={<StepBack size={20} />}
        onClick={() => void controller.previous()}
      />
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        variant="primary"
        size="lg"
        className="rounded-full"
        onClick={() => void controller.toggle()}
        icon={<PlayIcon busy={busy} playing={playing} />}
      />
      <IconButton
        label="Next sentence"
        icon={<StepForward size={20} />}
        onClick={() => void controller.next()}
      />
      <IconButton
        label="Next section"
        icon={<SkipForward size={18} />}
        className="hidden md:inline-flex"
        onClick={() => void controller.nextSection()}
      />
    </div>
  );
}

export function SpeedMenu({
  rate,
  onChange,
}: Readonly<{ rate: number; onChange: (rate: number) => void }>) {
  return (
    <Popover
      label="Playback speed"
      align="end"
      className="w-40"
      trigger={
        <button
          type="button"
          aria-label={`Playback speed ${rate}×`}
          className="h-9 rounded-[var(--radius-md)] px-2.5 text-sm font-medium text-muted tabular-nums hover:bg-surface-2 hover:text-text"
        >
          {rate}×
        </button>
      }
    >
      <OptionList
        label="Playback speed"
        options={SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }))}
        value={rate}
        onSelect={onChange}
      />
    </Popover>
  );
}

interface PositionProps {
  position: number;
  count: number;
  fraction: number;
  totalSeconds: number;
  onScrub: (value: number) => void;
  onCommit: (value: number) => void;
}

export function PositionSlider({
  position,
  count,
  fraction,
  totalSeconds,
  onScrub,
  onCommit,
}: Readonly<PositionProps>) {
  const elapsed = fraction * totalSeconds;
  return (
    <>
      <span className="w-12 text-right" aria-hidden="true">
        {formatClock(elapsed)}
      </span>
      <Slider
        label="Position in document"
        min={0}
        max={count - 1}
        value={position}
        valueText={(value) => `Sentence ${value + 1} of ${count}`}
        onChange={onScrub}
        onCommit={onCommit}
      />
      <span className="w-12" aria-hidden="true">
        -{formatClock(Math.max(totalSeconds - elapsed, 0))}
      </span>
    </>
  );
}

export function ShortcutSheet({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.action} className="contents">
            <dt className="flex gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-xs"
                >
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

/** The next faster preset speed, wrapping around to the slowest after the fastest. */
export function nextSpeed(rate: number): number {
  return SPEEDS.find((speed) => speed > rate + 0.001) ?? SPEEDS[0];
}
