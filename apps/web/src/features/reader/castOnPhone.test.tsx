// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the reader's saved casts on a phone or tablet paired in LAN mode.
 * Scope: A saved cast can be used but not removed from a phone: the remove control is absent and a
 *   note says where casts are removed.
 * Does NOT belong: The cast on this computer (cast.test.tsx) or LAN policy (the server).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as LanModule from '@/features/lan/LanIndicator';
import { openStyledReader, SERIES, styles } from '@/test/styledReader';

// Paired over the LAN: everything else about the indicator stays as it is.
vi.mock('@/features/lan/LanIndicator', async (importOriginal) => {
  const actual = await importOriginal<typeof LanModule>();
  return { ...actual, onThisComputer: () => false };
});

afterEach(() => vi.unstubAllGlobals());

describe('Saved casts on a phone', () => {
  it('offers a saved cast without a way to remove it, and says where that is done', async () => {
    const { state } = openStyledReader(styles());
    state.presets = [SERIES];
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Voices & effects' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voices and effects' });
    expect(await within(dialog).findByRole('button', { name: 'Use here' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /Remove the saved cast/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText('Saved casts are removed on the computer running TTSNative.'),
    ).toBeInTheDocument();
  });
});
