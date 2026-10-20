// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Accessible range slider (playback position, speed, pace).
 * Scope: Radix Slider with keyboard support, a visible focus ring on the thumb, an aria-valuetext
 *   formatter for screen readers and large touch targets.
 * Does NOT belong: The values' meaning (callers format them).
 */
import { Slider as RadixSlider } from 'radix-ui';
import { cn } from '@/lib/cn';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  valueText?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  valueText,
  onChange,
  onCommit,
  disabled,
  className,
}: Readonly<SliderProps>) {
  return (
    <RadixSlider.Root
      className={cn(
        'relative flex h-6 w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled ?? false}
      // Radix reports one value per thumb, and this slider has exactly one.
      onValueChange={(values) => values.forEach((next) => onChange(next))}
      onValueCommit={(values) => values.forEach((next) => onCommit?.(next))}
    >
      <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={label}
        aria-valuetext={valueText?.(value)}
        className="block size-4 rounded-full border-2 border-accent bg-surface shadow-soft transition-transform hover:scale-110 focus-visible:scale-110"
      />
    </RadixSlider.Root>
  );
}
