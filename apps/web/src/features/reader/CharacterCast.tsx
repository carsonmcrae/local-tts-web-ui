// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Give a book's characters their own voices, and reuse a cast in other books.
 * Scope: Lists the characters found in the text (from dialogue tags like "…," said Nicole), each with
 *   how many lines they speak, a sample line and a voice picker. Names can be added by hand. The
 *   cast can be saved under a name and applied to another book, and saved casts can be removed.
 *   The player then fetches the new audio.
 * Does NOT belong: Finding characters (the server) or styling single sentences.
 */
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useVoices } from '@/api/queries';
import {
  useApplyPreset,
  useAssignCharacter,
  useCastPresets,
  useCharacters,
  useDeletePreset,
  useSavePreset,
} from '@/api/stylingQueries';
import { Button, IconButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { onThisComputer } from '@/features/lan/LanIndicator';
import { voiceLabel } from './StyleSentencesDialog';

export function CharacterCast({
  documentId,
  onChanged,
}: Readonly<{ documentId: string; onChanged: () => void }>) {
  const characters = useCharacters(documentId);
  const voices = useVoices();
  const assign = useAssignCharacter(documentId);
  const presets = useCastPresets();
  const savePreset = useSavePreset(documentId);
  const applyPreset = useApplyPreset(documentId);
  const deletePreset = useDeletePreset();
  const here = onThisComputer(); // a paired phone may use a saved cast but not remove one
  const [newName, setNewName] = useState('');
  const [presetName, setPresetName] = useState('');
  const available = (voices.data ?? []).filter((voice) => voice.available);
  const list = Array.isArray(characters.data) ? characters.data : [];
  const saved = Array.isArray(presets.data) ? presets.data : [];
  const give = (name: string, voiceId: string | null) =>
    assign.mutate({ name, voiceId }, { onSuccess: onChanged });

  return (
    <section aria-label="Characters" className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Characters</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          No characters found yet. Names appear here when the text tags its dialogue, as in “Are you
          coming?” asked Nicole. You can also add a name.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((character) => (
            <li key={character.name} className="flex flex-col gap-1">
              <Field
                label={`${character.name}${character.lines ? ` · ${character.lines} lines` : ''}`}
                hint={character.sample ?? undefined}
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={character.voiceId ?? ''}
                    disabled={assign.isPending}
                    onChange={(event) => give(character.name, event.target.value || null)}
                  >
                    <option value="">The dialogue voice</option>
                    {available.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voiceLabel(voice)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (name && available[0]) {
            give(name, available[0].id);
            setNewName('');
          }
        }}
      >
        <Field label="Add a character" className="flex-1">
          {({ id }) => (
            <Input
              id={id}
              value={newName}
              maxLength={60}
              placeholder="A name as it appears in the text"
              onChange={(event) => setNewName(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="sm" icon={<Plus size={14} />} disabled={!newName.trim()}>
          Add
        </Button>
      </form>
      <details className="rounded-[var(--radius-md)] border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium select-none">Saved casts</summary>
        <div className="mt-3 flex flex-col gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (presetName.trim())
                savePreset.mutate(presetName.trim(), { onSuccess: () => setPresetName('') });
            }}
          >
            <Field label="Save this cast as" className="flex-1">
              {({ id }) => (
                <Input
                  id={id}
                  value={presetName}
                  maxLength={80}
                  placeholder="For example, the series name"
                  onChange={(event) => setPresetName(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" size="sm" icon={<Save size={14} />} disabled={!presetName.trim()}>
              Save
            </Button>
          </form>
          {saved.map((preset) => (
            <div key={preset.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {preset.name}{' '}
                <span className="text-muted">
                  ({Object.keys(preset.characters).length} characters)
                </span>
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() => applyPreset.mutate(preset.id, { onSuccess: onChanged })}
                >
                  Use here
                </Button>
                {here ? (
                  <IconButton
                    size="sm"
                    label={`Remove the saved cast ${preset.name}`}
                    icon={<Trash2 size={14} />}
                    onClick={() => deletePreset.mutate(preset.id)}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {!here && saved.length ? (
            <p className="text-[13px] text-muted">
              Saved casts are removed on the computer running TTSNative.
            </p>
          ) : null}
        </div>
      </details>
      {[assign, savePreset, applyPreset, deletePreset].map((mutation, position) =>
        mutation.isError ? (
          <Banner key={position} tone="error">
            {describeError(mutation.error)}
          </Banner>
        ) : null,
      )}
    </section>
  );
}
