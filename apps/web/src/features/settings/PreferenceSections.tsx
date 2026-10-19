/**
 * Purpose: Settings sections for appearance and playback preferences.
 * Scope: Theme (per device), default voice, playback speed, speaking pace, export format, skip
 *   interval and read-along auto-scroll — saved to the server so every browser shares them.
 * Does NOT belong: Engines, storage or diagnostics (SystemSections).
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePreferences, useSavePreferences, useVoices } from '@/api/queries';
import type { Preferences } from '@/api/types';
import { Field, Select, Switch } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { Slider } from '@/components/ui/Slider';
import { cn } from '@/lib/cn';
import { usePlayer } from '@/features/player/PlayerProvider';
import { SPEEDS } from '@/features/player/useShortcuts';
import type { ThemeChoice } from '@/lib/theme';
import { useTheme } from '@/lib/theme';

const THEMES: readonly { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <Monitor size={16} /> },
  { value: 'light', label: 'Light', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
];

export function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  return (
    <Section id="appearance" title="Appearance" description="Saved on this device only.">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 sm:max-w-md">
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border text-sm font-medium transition-colors',
              theme === option.value ? 'border-accent bg-accent-soft text-accent-text' : 'border-line hover:bg-surface-2',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function PlaybackSection() {
  const preferences = usePreferences();
  const save = useSavePreferences();
  const voices = useVoices();
  const { controller } = usePlayer();
  const prefs = preferences.data;
  if (!prefs) return null;
  const update = (patch: Partial<Preferences>) => save.mutate({ ...prefs, ...patch });

  return (
    <Section id="playback" title="Playback" description="Shared by every browser that opens this app.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Default voice">
          {({ id }) => (
            <Select
              id={id}
              value={prefs.defaultVoiceId}
              onChange={(event) => {
                update({ defaultVoiceId: event.target.value });
                void controller.setVoice(event.target.value);
              }}
            >
              {(voices.data ?? []).map((voice) => (
                <option key={voice.id} value={voice.id} disabled={!voice.available}>
                  {voice.name} · {voice.language}
                  {voice.available ? '' : ' (not installed)'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Playback speed" hint="Changes how fast audio plays; pitch is preserved.">
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={prefs.playbackRate}
              onChange={(event) => {
                const rate = Number(event.target.value);
                update({ playbackRate: rate });
                controller.setRate(rate);
              }}
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium" id="pace-label">
              Speaking pace
            </span>
            <span className="text-muted tabular-nums">{prefs.pace.toFixed(2)}×</span>
          </div>
          <Slider
            label="Speaking pace"
            min={0.7}
            max={1.4}
            step={0.05}
            value={prefs.pace}
            valueText={(value) => `${value.toFixed(2)} times`}
            onChange={(pace) => update({ pace })}
            onCommit={(pace) => void controller.setPace(pace)}
          />
          <p className="text-[13px] text-muted">How quickly the voice itself speaks (Kokoro voices). New audio is generated when it changes.</p>
        </div>
        <Field label="Export format">
          {({ id }) => (
            <Select id={id} value={prefs.exportFormat} onChange={(event) => update({ exportFormat: event.target.value as 'mp3' | 'wav' })}>
              <option value="mp3">MP3 (smaller)</option>
              <option value="wav">WAV (lossless)</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <Switch checked={prefs.autoScroll} onCheckedChange={(autoScroll) => update({ autoScroll })} label="Follow along while listening" description="Keep the sentence being spoken in view." />
      </div>
    </Section>
  );
}
