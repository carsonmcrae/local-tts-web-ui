// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One sound effect as a row in the Sounds panel: its sentence, sound, placement and actions.
 * Scope: `SuggestionRow` (preview, accept, dismiss, replace) and `EffectRow` (preview, on or off,
 *   edit, replace, remove) share one card: the sentence as a button that jumps to it, the sound's
 *   name, where it falls in the sentence, who placed it, and a warning when the sentence's text
 *   changed since. Also the small labels the panel and dialogs reuse.
 * Does NOT belong: Fetching, playing or deciding anything (SoundPanel, session.ts).
 */
import { Check, Pencil, Play, Repeat, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SfxEffect } from '@/api/types';
import { IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';

/** Where in its sentence an effect sounds, in plain words. */
export function placementLabel(effect: SfxEffect): string {
  let where = 'Near the end';
  if (effect.position <= 0) where = 'At the start';
  else if (effect.position >= 1) where = 'At the end';
  else if (effect.position < 0.35) where = 'Early on';
  else if (effect.position < 0.65) where = 'Halfway';
  const delay = effect.offsetMs / 1000;
  if (delay > 0) where += ` (+${delay.toFixed(1)} s)`;
  else if (delay < 0) where += ` (−${Math.abs(delay).toFixed(1)} s)`;
  if (effect.untilSegment !== null && effect.untilSegment !== undefined) {
    const count = effect.untilSegment - effect.segmentIndex + 1;
    where += ` · lasts ${count} sentence${count === 1 ? '' : 's'}`;
  }
  return where;
}

export function ownerLabel(effect: SfxEffect): string {
  return effect.origin === 'manual' ? 'Added by you' : 'Suggested';
}

interface CardProps {
  effect: SfxEffect;
  soundName: string;
  previewing: boolean;
  onJump: () => void;
  onPreview: () => void;
  actions: ReactNode;
  muted?: boolean;
}

function EffectCard({
  effect,
  soundName,
  previewing,
  onJump,
  onPreview,
  actions,
  muted = false,
}: Readonly<CardProps>) {
  return (
    <li className="rounded-[var(--radius-md)] border border-line" data-effect-id={effect.id}>
      <button
        type="button"
        onClick={onJump}
        className="w-full px-2.5 pt-2 text-left text-[13px] leading-snug hover:bg-surface-2"
      >
        <span className={muted ? 'line-clamp-2 text-muted' : 'line-clamp-2'}>{effect.text}</span>
      </button>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 pt-1">
        <span className="text-sm font-medium">{soundName}</span>
        <span className="text-xs text-muted">{placementLabel(effect)}</span>
        <Badge tone={effect.origin === 'manual' ? 'accent' : 'neutral'}>{ownerLabel(effect)}</Badge>
      </div>
      {effect.stale ? (
        <p className="px-2.5 pt-1 text-xs font-medium text-warning">
          The text here changed, so this effect isn’t played.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-0.5 px-1 pb-1">
        <IconButton
          size="sm"
          label={previewing ? `Stop the preview of ${soundName}` : `Preview ${soundName}`}
          icon={previewing ? <Square size={14} fill="currentColor" /> : <Play size={15} />}
          active={previewing}
          onClick={onPreview}
        />
        {actions}
      </div>
    </li>
  );
}

interface SuggestionRowProps extends Omit<CardProps, 'actions' | 'muted'> {
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onReplace: () => void;
}

export function SuggestionRow({
  busy,
  onAccept,
  onDismiss,
  onReplace,
  ...card
}: Readonly<SuggestionRowProps>) {
  return (
    <EffectCard
      {...card}
      actions={
        <>
          <IconButton
            size="sm"
            label={`Replace the sound for “${card.effect.text}”`}
            icon={<Repeat size={15} />}
            disabled={busy}
            onClick={onReplace}
          />
          <IconButton
            size="sm"
            label={`Dismiss the suggestion for “${card.effect.text}”`}
            icon={<X size={15} />}
            disabled={busy}
            onClick={onDismiss}
          />
          <IconButton
            size="sm"
            variant="primary"
            label={`Accept the suggestion for “${card.effect.text}”`}
            icon={<Check size={15} />}
            disabled={busy}
            onClick={onAccept}
          />
        </>
      }
    />
  );
}

interface EffectRowProps extends Omit<CardProps, 'actions' | 'muted'> {
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

export function EffectRow({
  busy,
  onToggle,
  onEdit,
  onReplace,
  onRemove,
  ...card
}: Readonly<EffectRowProps>) {
  const { effect } = card;
  return (
    <EffectCard
      {...card}
      muted={!effect.enabled}
      actions={
        <>
          <IconButton
            size="sm"
            label={
              effect.enabled
                ? `Turn off “${card.soundName}” here`
                : `Turn on “${card.soundName}” here`
            }
            icon={effect.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            active={effect.enabled}
            disabled={busy}
            onClick={onToggle}
          />
          <IconButton
            size="sm"
            label={`Adjust “${card.soundName}”`}
            icon={<Pencil size={15} />}
            disabled={busy}
            onClick={onEdit}
          />
          <IconButton
            size="sm"
            label={`Replace “${card.soundName}”`}
            icon={<Repeat size={15} />}
            disabled={busy}
            onClick={onReplace}
          />
          <IconButton
            size="sm"
            label={`Remove “${card.soundName}”`}
            icon={<Trash2 size={15} />}
            disabled={busy}
            onClick={onRemove}
          />
        </>
      }
    />
  );
}
