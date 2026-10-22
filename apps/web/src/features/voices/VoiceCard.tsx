// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One voice in the Voice Library.
 * Scope: Name, engine, language, gender, built-in/custom, upstream quality grade, availability,
 *   a one-line credit (its model and licence; every voice is synthetic) with a link to the library's full
 *   credits, preview play/stop,
 *   and "use for reading" (sets the default voice).
 * Does NOT belong: Filtering or the preview audio itself (useVoicePreview).
 */
import { Check, Loader2, Play, Square } from 'lucide-react';
import type { VoiceInfo } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { CREDITS_ID, showCredits } from './VoiceCredits';

const ENGINE_NAMES: Record<string, string> = { kokoro: 'Kokoro', chatterbox: 'Chatterbox' };

interface VoiceCardProps {
  voice: VoiceInfo;
  isDefault: boolean;
  previewStatus: 'idle' | 'loading' | 'playing';
  previewError?: string | undefined;
  onPreview: () => void;
  onStop: () => void;
  onUse: () => void;
}

function PreviewButton({
  voice,
  status,
  onPreview,
  onStop,
}: Readonly<{
  voice: VoiceInfo;
  status: VoiceCardProps['previewStatus'];
  onPreview: () => void;
  onStop: () => void;
}>) {
  if (status === 'playing') {
    return (
      <Button
        size="sm"
        icon={<Square size={13} fill="currentColor" />}
        onClick={onStop}
        aria-label={`Stop preview of ${voice.name}`}
      >
        Stop
      </Button>
    );
  }
  const loading = status === 'loading';
  return (
    <Button
      size="sm"
      icon={
        loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Play size={14} fill="currentColor" />
        )
      }
      onClick={onPreview}
      disabled={!voice.available || loading}
      aria-label={`Preview ${voice.name}`}
    >
      {loading ? 'Generating…' : 'Preview'}
    </Button>
  );
}

function describeVoice(voice: VoiceInfo): string {
  const gender = voice.gender === 'unspecified' ? '' : ` · ${voice.gender}`;
  return `${voice.language}${gender} · ${ENGINE_NAMES[voice.engineId] ?? voice.engineId}`;
}

/** The voice's one-line credit, with a link to the library's full credits when it has them. */
function VoiceCredit({ voice }: Readonly<{ voice: VoiceInfo }>) {
  if (!voice.credit) return null;
  return (
    <p className="text-xs leading-snug text-subtle">
      {voice.credit}
      {voice.attribution ? (
        <>
          {' · '}
          <a
            href={`#${CREDITS_ID}`}
            onClick={showCredits}
            aria-label={`Credits for ${voice.name}`}
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Credits
          </a>
        </>
      ) : null}
    </p>
  );
}

export function VoiceCard({
  voice,
  isDefault,
  previewStatus,
  previewError,
  onPreview,
  onStop,
  onUse,
}: Readonly<VoiceCardProps>) {
  const initials = voice.name.slice(0, 2).toUpperCase();
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-[var(--radius-lg)] border bg-surface p-4 shadow-soft',
        isDefault ? 'border-accent' : 'border-line',
        // Unavailable shows as a dashed border and the "Engine not installed" badge, never by dimming,
        // which would take the card's text below 4.5:1 contrast.
        !voice.available && 'border-dashed',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            voice.category === 'custom'
              ? 'bg-success-soft text-success'
              : 'bg-accent-soft text-accent-text',
          )}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-medium">
            <span className="truncate">{voice.name}</span>
            {isDefault ? <Badge tone="accent">Default</Badge> : null}
          </h3>
          <p className="truncate text-[13px] text-muted">{describeVoice(voice)}</p>
        </div>
        {voice.qualityGrade ? (
          <span
            title="Upstream quality grade (A is best)"
            className="rounded-md border border-line px-1.5 py-0.5 text-xs font-semibold text-muted tabular-nums"
          >
            {voice.qualityGrade}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={voice.category === 'custom' ? 'success' : 'neutral'}>
          {voice.category === 'custom' ? 'Custom' : 'Built-in'}
        </Badge>
        {voice.available ? null : <Badge tone="warning">Engine not installed</Badge>}
      </div>
      {voice.description ? (
        <p className="text-[13px] leading-snug text-muted">{voice.description}</p>
      ) : null}
      <VoiceCredit voice={voice} />
      {previewError ? (
        <p className="text-[13px] text-danger" role="alert">
          {previewError}
        </p>
      ) : null}
      <div className="mt-auto flex gap-2">
        <PreviewButton voice={voice} status={previewStatus} onPreview={onPreview} onStop={onStop} />
        <Button
          size="sm"
          variant={isDefault ? 'subtle' : 'ghost'}
          icon={isDefault ? <Check size={14} /> : undefined}
          onClick={onUse}
          disabled={!voice.available || isDefault}
        >
          {isDefault ? 'Reading voice' : 'Use for reading'}
        </Button>
      </div>
    </li>
  );
}
