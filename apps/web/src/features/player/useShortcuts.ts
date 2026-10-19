/**
 * Purpose: Global keyboard shortcuts for listening without touching the mouse.
 * Scope: Space/K play-pause, ←/→ previous/next sentence, Shift+←/→ previous/next section, [ and ]
 *   slower/faster, ? opens the shortcut sheet. Ignored while typing, inside dialogs, on native
 *   interactive controls (so Space still activates buttons) and with Ctrl/Alt/Meta held.
 * Does NOT belong: Command implementations (PlaybackController).
 */
import { useEffect } from 'react';
import type { PlaybackController } from './controller';

export const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const SHORTCUTS: readonly { keys: string[]; action: string }[] = [
  { keys: ['Space', 'K'], action: 'Play or pause' },
  { keys: ['←', '→'], action: 'Previous or next sentence' },
  { keys: ['Shift ←', 'Shift →'], action: 'Previous or next section' },
  { keys: ['[', ']'], action: 'Slower or faster' },
  { keys: ['?'], action: 'Show keyboard shortcuts' },
];

const INTERACTIVE =
  'input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="dialog"] *';

/** The neighbouring preset speed in `direction`; the current speed at either end of the ladder. */
export function stepSpeed(current: number, direction: 1 | -1): number {
  const next =
    direction === 1
      ? SPEEDS.find((speed) => speed > current + 0.001)
      : SPEEDS.findLast((speed) => speed < current - 0.001);
  return next ?? current;
}

export function useShortcuts(
  controller: PlaybackController,
  options: { enabled: boolean; onRateChange: (rate: number) => void; onHelp: () => void },
): void {
  const { enabled, onRateChange, onHelp } = options;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(INTERACTIVE)) return;
      const actions: Record<string, () => void> = {
        ' ': () => void controller.toggle(),
        k: () => void controller.toggle(),
        ArrowLeft: () =>
          void (event.shiftKey ? controller.previousSection() : controller.previous()),
        ArrowRight: () => void (event.shiftKey ? controller.nextSection() : controller.next()),
        '[': () => onRateChange(stepSpeed(controller.getState().rate, -1)),
        ']': () => onRateChange(stepSpeed(controller.getState().rate, 1)),
        '?': onHelp,
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [controller, enabled, onRateChange, onHelp]);
}
