// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: The player's sleep timer.
 * Scope: Stop after 5 to 60 minutes or at the end of the section being read; shows the minutes left
 *   (refreshed while a timer runs) and turns the timer off. Playback always stops between sentences.
 * Does NOT belong: Stopping playback (PlaybackController.setSleepTimer).
 */
import { Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OptionList, Popover } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import type { SleepTimer } from './controller';

const MINUTES = [5, 10, 15, 30, 45, 60] as const;
const CHOICES: readonly { value: string; label: string }[] = [
  { value: 'off', label: 'Off' },
  ...MINUTES.map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` })),
  { value: 'section', label: 'End of this section' },
];

/** The current time, refreshed when a timed sleep starts and every few seconds while it runs. */
function useClock(endsAt: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (endsAt === null) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [endsAt]);
  return now;
}

export function sleepLabel(sleep: SleepTimer | null, now: number): string | null {
  if (!sleep) return null;
  if (sleep.kind === 'section') return 'End of section';
  return `${Math.max(Math.ceil((sleep.endsAt - now) / 60_000), 1)} min`;
}

export function SleepMenu({
  sleep,
  onChange,
}: Readonly<{ sleep: SleepTimer | null; onChange: (choice: number | 'section' | null) => void }>) {
  const [open, setOpen] = useState(false);
  const now = useClock(sleep?.kind === 'minutes' ? sleep.endsAt : null);
  const label = sleepLabel(sleep, now);
  const choose = (value: string) => {
    setOpen(false);
    if (value === 'off') onChange(null);
    else if (value === 'section') onChange('section');
    else onChange(Number(value));
  };
  return (
    <Popover
      label="Sleep timer"
      align="end"
      className="w-52"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={label ? `Sleep timer: ${label}. Change` : 'Sleep timer'}
          title="Sleep timer"
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm font-medium tabular-nums hover:bg-surface-2 hover:text-text',
            label ? 'text-accent-text' : 'text-muted',
          )}
        >
          <Moon size={17} />
          {label ? <span className="text-xs">{label}</span> : null}
        </button>
      }
    >
      <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-subtle uppercase">
        Stop playing
      </p>
      <OptionList label="Sleep timer" options={CHOICES} value={choiceOf(sleep)} onSelect={choose} />
    </Popover>
  );
}

function choiceOf(sleep: SleepTimer | null): string {
  if (!sleep) return 'off';
  return sleep.kind === 'section' ? 'section' : 'timed';
}
