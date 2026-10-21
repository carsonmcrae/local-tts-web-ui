// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for release-note helpers, the desktop bridge and the build version.
 * Scope: Notes built into the app, notes from an update check, version helpers, dates, the Tauri
 *   commands the bridge calls (mocked) and the version stamped into the build.
 * Does NOT belong: Update UI (features/updates/updates.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktop, isDesktop } from './desktop';
import {
  baseVersion,
  formatReleaseDate,
  isDevelopmentBuild,
  notesFor,
  parseReleaseMarkdown,
  releaseHistory,
  releaseUrl,
} from './releaseHistory';
import { appVersion } from './version';

const tauri = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauri.invoke,
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));

afterEach(() => tauri.invoke.mockClear());

describe('release notes', () => {
  it('come from the build, or are empty without it', () => {
    vi.stubGlobal('__RELEASE_HISTORY__', undefined);
    expect(releaseHistory()).toEqual([]);
    expect(notesFor('2.0.0')).toBeUndefined();
    const notes = {
      version: '2.0.0',
      date: '2026-10-19',
      publishedAs: null,
      summary: 's',
      sections: [],
    };
    vi.stubGlobal('__RELEASE_HISTORY__', [notes]);
    expect(notesFor('2.0.0')).toBe(notes);
  });

  it('are read from the Markdown an update check returns', () => {
    const notes = parseReleaseMarkdown(
      '2.1.0',
      null,
      'First line.\r\nSecond line.\n\n## New\n\n- One.\n* Two.\n\n## Empty\n\nloose text\n',
    );
    expect(notes).toEqual({
      version: '2.1.0',
      date: '',
      publishedAs: null,
      summary: 'First line. Second line.',
      sections: [{ key: 'new', title: 'New', items: ['One.', 'Two.'] }],
    });
    expect(
      parseReleaseMarkdown('2.1.0', '2026-11-02', '- An item before any heading.').summary,
    ).toBe('- An item before any heading.');
  });

  it('describe versions and dates for people', () => {
    expect(baseVersion('2.1.0-dev.3+feat.abc')).toBe('2.1.0');
    expect(baseVersion('2.1.0')).toBe('2.1.0');
    expect(isDevelopmentBuild('2.1.0+build')).toBe(true);
    expect(isDevelopmentBuild('2.1.0')).toBe(false);
    expect(formatReleaseDate('2026-10-19')).toBe('October 19, 2026');
    expect(formatReleaseDate('')).toBe('');
    expect(releaseUrl('2.0.0')).toBe(
      'https://github.com/carsonmcrae/ttsnative/releases/tag/v2.0.0',
    );
  });
});

describe('the desktop bridge', () => {
  it('knows when it runs inside the desktop app', () => {
    expect(isDesktop()).toBe(false);
    (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__ = true;
    expect(isDesktop()).toBe(true);
    delete (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__;
  });

  it('calls only the commands the app allows, with their arguments', async () => {
    await desktop.info();
    await desktop.check(true);
    await desktop.snooze('2.1.0');
    await desktop.setAutoCheck(false);
    await desktop.openFolder('logs');
    const events: unknown[] = [];
    await desktop.install((event) => events.push(event));
    expect(tauri.invoke.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'desktop_info',
      'update_check',
      'update_snooze',
      'update_set_auto',
      'open_folder',
      'update_install',
    ]);
    const channel = (tauri.invoke.mock.calls.at(-1) as unknown[])[1] as {
      onEvent: { onmessage: (event: unknown) => void };
    };
    channel.onEvent.onmessage({ event: 'verifying' });
    expect(events).toEqual([{ event: 'verifying' }]);
  });
});

describe('the build version', () => {
  it('is stamped at build time, or "dev" without it', () => {
    expect(appVersion()).toBe('test');
    vi.stubGlobal('__APP_VERSION__', undefined);
    expect(appVersion()).toBe('dev');
  });
});
