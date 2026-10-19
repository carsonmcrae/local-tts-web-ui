/**
 * Purpose: The persistent audio player docked at the bottom of every screen.
 * Scope: Wires player state to the transport, position, voice, speed and export controls; persists
 *   voice/speed choices as preferences; enables keyboard shortcuts; collapses to a compact layout on
 *   phones and announces errors to assistive technology.
 * Does NOT belong: Playback logic (controller.ts) or presentational pieces (PlayerParts.tsx).
 */
import { Download, Keyboard } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { usePreferences, useSavePreferences, useVoices } from '@/api/queries';
import { IconButton } from '@/components/ui/Button';
import { ExportDialog } from '@/features/reader/ExportDialog';
import type { PlayerState } from './controller';
import {
  ErrorStrip,
  nextSpeed,
  PositionSlider,
  ShortcutSheet,
  SpeedMenu,
  Transport,
} from './PlayerParts';
import { usePlayer } from './PlayerProvider';
import { useShortcuts } from './useShortcuts';
import { VoicePicker } from './VoicePicker';

function usePlayerPreferences() {
  const { controller } = usePlayer();
  const preferences = usePreferences();
  const save = useSavePreferences();
  const persist = useCallback(
    (patch: { defaultVoiceId?: string; playbackRate?: number }) => {
      if (preferences.data) save.mutate({ ...preferences.data, ...patch });
    },
    [preferences.data, save],
  );
  const changeRate = useCallback(
    (rate: number) => {
      controller.setRate(rate);
      persist({ playbackRate: rate });
    },
    [controller, persist],
  );
  const changeVoice = useCallback(
    (voiceId: string) => {
      void controller.setVoice(voiceId);
      persist({ defaultVoiceId: voiceId });
    },
    [controller, persist],
  );
  return { changeRate, changeVoice };
}

/** Fraction of the document already heard, including progress inside the current sentence. */
function listenedFraction(state: PlayerState, position: number, count: number): number {
  const within = state.duration > 0 ? state.currentTime / state.duration : 0;
  return Math.min((position + within) / count, 1);
}

export function PlayerBar() {
  const { controller, state } = usePlayer();
  const voices = useVoices();
  const { changeRate, changeVoice } = usePlayerPreferences();
  const [scrub, setScrub] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const { document, status, rate } = state;
  useShortcuts(controller, {
    enabled: Boolean(document),
    onRateChange: changeRate,
    onHelp: openHelp,
  });
  if (!document) return null;

  const count = Math.max(document.segmentCount, 1);
  const position = scrub ?? state.segmentIndex;
  const section = controller.sectionAt(position);
  const busy = status === 'loading';
  const voicePicker = (compact: boolean) => (
    <VoicePicker
      compact={compact}
      voices={voices.data ?? []}
      value={state.voiceId}
      onChange={changeVoice}
    />
  );

  return (
    <section
      aria-label="Audio player"
      className="border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      {status === 'error' ? (
        <ErrorStrip error={state.error} onRetry={() => void controller.play()} />
      ) : null}
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 md:py-2.5">
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            to={`/read/${document.id}`}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] md:w-56 md:flex-none lg:w-64"
            aria-label={`Open ${document.title}`}
          >
            <p className="truncate text-sm font-medium">{document.title}</p>
            <p className="truncate text-xs text-muted">{section?.title ?? <>&nbsp;</>}</p>
          </Link>
          <Transport controller={controller} busy={busy} playing={status === 'playing' || busy} />
          <div className="hidden items-center gap-0.5 md:flex md:w-56 md:justify-end lg:w-64">
            {voicePicker(false)}
            <SpeedMenu rate={rate} onChange={changeRate} />
            <IconButton
              label="Export audio"
              icon={<Download size={18} />}
              onClick={() => setExportOpen(true)}
            />
            <IconButton
              label="Keyboard shortcuts"
              icon={<Keyboard size={18} />}
              className="hidden lg:inline-flex"
              onClick={openHelp}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted tabular-nums">
          <PositionSlider
            position={position}
            count={count}
            fraction={listenedFraction(state, position, count)}
            totalSeconds={document.estimatedSeconds / rate}
            onScrub={setScrub}
            onCommit={(value) => {
              setScrub(null);
              void controller.seek(value);
            }}
          />
          <div className="flex items-center md:hidden">
            {voicePicker(true)}
            <button
              type="button"
              aria-label={`Playback speed ${rate}×. Change speed`}
              onClick={() => changeRate(nextSpeed(rate))}
              className="h-9 rounded-[var(--radius-md)] px-2 font-medium tabular-nums"
            >
              {rate}×
            </button>
            <IconButton
              label="Export audio"
              icon={<Download size={17} />}
              size="sm"
              onClick={() => setExportOpen(true)}
            />
          </div>
        </div>
      </div>
      <ShortcutSheet open={helpOpen} onOpenChange={setHelpOpen} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        documentId={document.id}
        sections={document.sections}
        currentSection={section?.index ?? 0}
        voiceId={state.voiceId}
        pace={state.pace}
      />
    </section>
  );
}
