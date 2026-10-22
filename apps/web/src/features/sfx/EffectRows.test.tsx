// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the labels and rows that describe one sound effect in the Sounds panel.
 * Scope: Where an effect falls in its sentence (start, early, halfway, near or at the end, with a
 *   delay, and how long an ambience lasts), who placed it, and a placed effect shown as turned off.
 * Does NOT belong: The panel's behaviour (sfx.test.tsx, panel.test.tsx).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EffectRow, ownerLabel, placementLabel } from './EffectRows';
import { effect } from './scheduler.test';

describe('effect labels', () => {
  it('says where an effect falls in its sentence', () => {
    expect(placementLabel(effect({ position: 0 }))).toBe('At the start');
    expect(placementLabel(effect({ position: 0.2 }))).toBe('Early on');
    expect(placementLabel(effect({ position: 0.5 }))).toBe('Halfway');
    expect(placementLabel(effect({ position: 0.8 }))).toBe('Near the end');
    expect(placementLabel(effect({ position: 1 }))).toBe('At the end');
    expect(placementLabel(effect({ offsetMs: 1500 }))).toBe('At the start (+1.5 s)');
    expect(placementLabel(effect({ offsetMs: -500 }))).toBe('At the start (−0.5 s)');
    expect(placementLabel(effect({ segmentIndex: 3, untilSegment: 3 }))).toBe(
      'At the start · lasts 1 sentence',
    );
    expect(placementLabel(effect({ segmentIndex: 3, untilSegment: 7 }))).toBe(
      'At the start · lasts 5 sentences',
    );
    expect(ownerLabel(effect())).toBe('Suggested');
    expect(ownerLabel(effect({ origin: 'manual' }))).toBe('Added by you');
  });

  it('shows a placed effect that is turned off, with a button to turn it on', () => {
    const onToggle = vi.fn();
    render(
      <ol>
        <EffectRow
          effect={effect({ enabled: false, origin: 'manual' })}
          soundName="A heavy thud"
          previewing={false}
          busy={false}
          onJump={vi.fn()}
          onPreview={vi.fn()}
          onToggle={onToggle}
          onEdit={vi.fn()}
          onReplace={vi.fn()}
          onRemove={vi.fn()}
        />
      </ol>,
    );
    screen.getByRole('button', { name: 'Turn on “A heavy thud” here' }).click();
    expect(onToggle).toHaveBeenCalled();
    expect(screen.getByText('Thunder rumbled.')).toHaveClass('text-muted');
    expect(screen.getByText('Added by you')).toBeInTheDocument();
  });
});
