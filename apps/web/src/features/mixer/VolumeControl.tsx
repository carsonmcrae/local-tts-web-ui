// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One channel's level in the audio mixer: its name, percentage and a 0–100 % slider.
 * Scope: Shows the channel's name with its current percentage (and an optional control beside them,
 *   such as an on/off switch), announces the value as a percentage, and can be disabled with a short
 *   explanation (for example where the device sets the level).
 * Does NOT belong: Saving or applying the level (each channel's owner) or the panel (MixerMenu).
 */
import type { ReactNode } from 'react';
import { Slider } from '@/components/ui/Slider';

interface VolumeControlProps {
  /** The channel's visible name, e.g. "Narration". */
  name: string;
  /** The slider's accessible name, e.g. "Narration volume". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Shown beside the percentage (e.g. the channel's on/off switch). */
  action?: ReactNode;
  /** Shown under the slider; the slider is disabled when given. */
  unavailable?: string | undefined;
}

export function VolumeControl({
  name,
  label,
  value,
  onChange,
  action,
  unavailable,
}: Readonly<VolumeControlProps>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="text-sm font-medium">{name}</span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-muted tabular-nums" aria-hidden="true">
            {value}%
          </span>
          {action}
        </span>
      </div>
      <Slider
        label={label}
        min={0}
        max={100}
        value={value}
        valueText={(level) => (unavailable ? `${level}%. ${unavailable}` : `${level}%`)}
        onChange={onChange}
        disabled={Boolean(unavailable)}
      />
      {unavailable ? <p className="text-[13px] leading-snug text-muted">{unavailable}</p> : null}
    </div>
  );
}
