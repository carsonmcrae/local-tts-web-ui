// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The Settings screen.
 * Scope: Section index (desktop), hash deep links (e.g. /settings#engines) and the ordered settings
 *   sections.
 * Does NOT belong: Section internals.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { PageHeader } from '@/components/ui/Layout';
import { PronunciationSection } from '@/features/pronunciation/PronunciationSection';
import { AudiobookshelfSection } from './AudiobookshelfSection';
import { AppearanceSection, PlaybackSection } from './PreferenceSections';
import { AboutSection, EnginesSection, PrivacySection, StorageSection } from './SystemSections';

const INDEX = [
  ['appearance', 'Appearance'],
  ['playback', 'Playback'],
  ['pronunciation', 'Pronunciation'],
  ['engines', 'Engines & models'],
  ['storage', 'Storage'],
  ['audiobookshelf', 'Audiobookshelf'],
  ['privacy', 'Privacy'],
  ['about', 'About'],
] as const;

export default function SettingsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-6 sm:px-8 sm:py-10">
      <nav
        aria-label="Settings sections"
        className="sticky top-10 hidden w-44 shrink-0 self-start lg:block"
      >
        <ul className="flex flex-col gap-0.5 text-sm">
          {INDEX.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block rounded-[var(--radius-md)] px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Settings"
          description="Preferences, pronunciation, engines, storage, Audiobookshelf and privacy."
        />
        <div className="flex flex-col gap-8">
          <AppearanceSection />
          <PlaybackSection />
          <PronunciationSection />
          <EnginesSection />
          <StorageSection />
          <AudiobookshelfSection />
          <PrivacySection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}
