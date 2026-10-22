// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Mix built-in voices into a new one, and remove blends made earlier.
 * Scope: "Blend voices" opens a dialog with a name and two to four built-in Kokoro voices, each with a
 *   share (shown as a percentage of the mix); the blend then appears in the voice list like any other
 *   voice, to preview and read with. It says plainly what can't be blended (cloned voices) and that
 *   the blend speaks with the first voice's accent. "Your blends" lists them with Delete (confirmed).
 * Does NOT belong: Mixing the voices (the server and Kokoro) or previews (VoiceCard).
 */
import { Blend, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useBlends, useCreateBlend, useDeleteBlend, type VoiceBlend } from '@/api/blendQueries';
import type { VoiceInfo } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { closeOnly, ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface Part {
  voiceId: string;
  weight: number; // 1-10, relative
}

const percent = (weight: number, parts: readonly Part[]) =>
  Math.round((weight / parts.reduce((total, part) => total + part.weight, 0)) * 100);

/** The voices that can be blended: built-in Kokoro voices that are installed. */
function blendable(voices: readonly VoiceInfo[]): VoiceInfo[] {
  return voices.filter(
    (voice) => voice.engineId === 'kokoro' && voice.category === 'built-in' && voice.available,
  );
}

function PartRow({
  part,
  position,
  choices,
  parts,
  onChange,
  onRemove,
}: Readonly<{
  part: Part;
  position: number;
  choices: readonly VoiceInfo[];
  parts: readonly Part[];
  onChange: (part: Part) => void;
  onRemove: (() => void) | null;
}>) {
  const label = `Voice ${position + 1}`;
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-line p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <Field label={label}>
        {({ id }) => (
          <Select
            id={id}
            value={part.voiceId}
            onChange={(event) => onChange({ ...part, voiceId: event.target.value })}
          >
            {choices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} · {voice.language}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={`Share of the mix: ${percent(part.weight, parts)}%`}>
        {({ id }) => (
          <input
            id={id}
            type="range"
            min={1}
            max={10}
            value={part.weight}
            aria-valuetext={`${percent(part.weight, parts)} percent`}
            className="h-10 w-full accent-[var(--color-accent)]"
            onChange={(event) => onChange({ ...part, weight: Number(event.target.value) })}
          />
        )}
      </Field>
      {onRemove ? (
        <IconButton
          label={`Remove ${label.toLowerCase()}`}
          icon={<X size={16} />}
          onClick={onRemove}
        />
      ) : null}
    </div>
  );
}

function BlendDialog({
  open,
  onOpenChange,
  choices,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: readonly VoiceInfo[];
}>) {
  const create = useCreateBlend();
  const toast = useToast();
  const part = (voice: VoiceInfo): Part => ({ voiceId: voice.id, weight: 5 });
  const [name, setName] = useState('');
  const [parts, setParts] = useState<Part[]>(choices.slice(0, 2).map(part)); // always two here
  const repeated = new Set(parts.map((part) => part.voiceId)).size !== parts.length;
  const close = () => {
    onOpenChange(false);
    create.reset();
  };
  const save = () =>
    create.mutate(
      { name: name.trim(), parts },
      {
        onSuccess: (blend) => {
          toast.notify(
            'success',
            `${blend.name} is ready`,
            'Find it in the voice list to preview it.',
          );
          setName('');
          close();
        },
      },
    );
  const update = (position: number, next: Part) =>
    setParts(parts.map((part, index) => (index === position ? next : part)));
  return (
    <Dialog
      open={open}
      onOpenChange={closeOnly(close)}
      title="Blend voices"
      description="Mix two to four built-in voices into a new one."
      size="lg"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Blend size={15} />}
            loading={create.isPending}
            disabled={!name.trim() || repeated}
            onClick={save}
          >
            Make this blend
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={60}
              placeholder="My blend"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        {parts.map((part, position) => (
          <PartRow
            key={position}
            part={part}
            position={position}
            choices={choices}
            parts={parts}
            onChange={(next) => update(position, next)}
            onRemove={
              parts.length > 2
                ? () => setParts(parts.filter((_, index) => index !== position))
                : null
            }
          />
        ))}
        {parts.length < 4 ? (
          <div>
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setParts([...parts, ...choices.slice(0, 1).map(part)])}
            >
              Add a voice
            </Button>
          </div>
        ) : null}
        {repeated ? <Banner tone="warning">Choose a different voice for each part.</Banner> : null}
        <p className="text-[13px] leading-relaxed text-muted">
          Only built-in Kokoro voices can be blended: their sound is described by numbers that mix
          well. Cloned voices copy one person’s recording, so they can’t be mixed. A blend reads
          with the first voice’s accent and pronunciation.
        </p>
        {create.isError ? <Banner tone="error">{describeError(create.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

function BlendItem({ blend }: Readonly<{ blend: VoiceBlend }>) {
  const remove = useDeleteBlend();
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="min-w-0 truncate">{blend.name}</span>
      <IconButton
        label={`Delete ${blend.name}`}
        icon={<Trash2 size={15} />}
        size="sm"
        onClick={() => setConfirm(true)}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${blend.name}?`}
        description="Sentences set to read with it go back to the reading voice."
        confirmLabel="Delete blend"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(blend.id, { onSuccess: () => setConfirm(false) })}
      />
    </li>
  );
}

export function BlendVoices({ voices }: Readonly<{ voices: readonly VoiceInfo[] }>) {
  const [open, setOpen] = useState(false);
  const blends = useBlends();
  const choices = blendable(voices);
  if (choices.length < 2) return null; // Kokoro isn't installed yet
  return (
    <>
      <Button icon={<Blend size={16} />} onClick={() => setOpen(true)}>
        Blend voices
      </Button>
      {open ? <BlendDialog open={open} onOpenChange={setOpen} choices={choices} /> : null}
      {blends.data && blends.data.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted select-none">
            Your blends ({blends.data.length})
          </summary>
          <ul className="mt-1 w-64">
            {blends.data.map((blend) => (
              <BlendItem key={blend.id} blend={blend} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
