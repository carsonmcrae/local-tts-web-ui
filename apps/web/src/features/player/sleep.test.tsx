// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the player's sleep timer menu.
 * Scope: Choosing minutes, the end of the section or off; the time left shown on the button; and
 *   the menu driving the player from the docked bar.
 * Does NOT belong: When playback stops (controller.test.ts).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReaderPage from '@/features/reader/ReaderPage';
import { documentDetail, mockReaderApi, PlayerSpy, renderWithApp } from '@/test/render';
import type { SleepTimer } from './controller';
import { PlayerBar } from './PlayerBar';
import type { usePlayer } from './PlayerProvider';
import { SleepMenu, sleepLabel } from './SleepMenu';

afterEach(() => vi.unstubAllGlobals());

function Harness() {
  const [sleep, setSleep] = useState<SleepTimer | null>(null);
  return (
    <SleepMenu
      sleep={sleep}
      onChange={(choice) => {
        if (choice === null) setSleep(null);
        else if (choice === 'section') setSleep({ kind: 'section' });
        else setSleep({ kind: 'minutes', endsAt: Date.now() + choice * 60_000 });
      }}
    />
  );
}

const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: RegExp,
  option: string,
) => {
  await user.click(screen.getByRole('button', { name: trigger }));
  const menu = await screen.findByRole('dialog', { name: 'Sleep timer' });
  await user.click(within(menu).getByRole('radio', { name: option }));
};

describe('Sleep timer', () => {
  it('stops after a number of minutes or at the end of the section, or not at all', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await choose(user, /^Sleep timer$/, '15 minutes');
    expect(
      await screen.findByRole('button', { name: 'Sleep timer: 15 min. Change' }),
    ).toBeVisible();
    await choose(user, /Sleep timer: 15 min/, 'End of this section');
    expect(
      screen.getByRole('button', { name: 'Sleep timer: End of section. Change' }),
    ).toBeVisible();
    await choose(user, /End of section/, 'Off');
    expect(screen.getByRole('button', { name: 'Sleep timer' })).toBeVisible();
  });

  it('counts down in whole minutes and never shows less than one', () => {
    expect(sleepLabel(null, 0)).toBeNull();
    expect(sleepLabel({ kind: 'minutes', endsAt: 150_000 }, 0)).toBe('3 min');
    expect(sleepLabel({ kind: 'minutes', endsAt: 1_000 }, 5_000)).toBe('1 min');
  });

  it('sets the player to stop from the docked player bar', async () => {
    const doc = documentDetail();
    mockReaderApi(doc);
    const user = userEvent.setup();
    const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
    renderWithApp(
      <>
        <ReaderPage />
        <PlayerBar />
        <PlayerSpy onPlayer={(player) => (latest.player = player)} />
      </>,
      { path: '/read/:documentId', route: `/read/${doc.id}` },
    );
    const player = await screen.findByRole('region', { name: 'Audio player' });
    const [trigger] = within(player).getAllByRole('button', { name: 'Sleep timer' });
    await user.click(trigger as HTMLElement);
    const menu = await screen.findByRole('dialog', { name: 'Sleep timer' });
    await user.click(within(menu).getByRole('radio', { name: '30 minutes' }));
    await waitFor(() => expect(latest.player?.state.sleep?.kind).toBe('minutes'));
  });
});
