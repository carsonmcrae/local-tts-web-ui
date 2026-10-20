/**
 * Purpose: Live microphone input level as a row of bars.
 * Scope: Purely visual (hidden from assistive tech); the top bars turn red as a clipping warning.
 * Does NOT belong: Measuring the level (the recorders do).
 */
import { cn } from '@/lib/cn';

const BARS = 24;

/** Colour of one meter bar: lit bars turn red near the top of the range, as a clipping warning. */
function barColor(lit: boolean, hot: boolean): string {
  if (!lit) return 'bg-surface-3';
  return hot ? 'bg-danger' : 'bg-accent';
}

export function LevelMeter({ level }: Readonly<{ level: number }>) {
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-1.5 rounded-sm transition-[height,background-color] duration-75',
            barColor(level * BARS > i, i > BARS * 0.85),
          )}
          style={{ height: `${30 + (i / BARS) * 70}%` }}
        />
      ))}
    </div>
  );
}
