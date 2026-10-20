// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Settings → Pronunciation: teach the voices how to say names and words.
 * Scope: Add a word with how it should be said (optionally matching its exact letter case), hear it
 *   in the current reading voice before and after saving, change or remove a word. The rules apply
 *   to every document, preview and export; only sentences containing a changed word get new audio.
 * Does NOT belong: Matching and storing the rules (the server).
 */
import { Pencil, Plus, Trash2, Volume2 } from 'lucide-react';
import type { SubmitEvent } from 'react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import {
  useDeletePronunciation,
  usePronunciations,
  useSavePronunciation,
} from '@/api/readingQueries';
import type { Pronunciation } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Banner, Badge, Skeleton } from '@/components/ui/Feedback';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { usePlayer } from '@/features/player/PlayerProvider';
import { useVoicePreview } from '@/features/voices/useVoicePreview';

interface Draft {
  id?: string;
  word: string;
  sayAs: string;
  matchCase: boolean;
}

const EMPTY: Draft = { word: '', sayAs: '', matchCase: false };

function RuleForm({
  draft,
  onDraft,
  onHear,
}: Readonly<{ draft: Draft; onDraft: (draft: Draft) => void; onHear: (text: string) => void }>) {
  const save = useSavePronunciation();
  const ready = draft.word.trim() !== '' && draft.sayAs.trim() !== '';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button is disabled until both fields are filled, so a submitted form is always ready.
    save.mutate(draft, { onSuccess: () => onDraft(EMPTY) });
  };
  return (
    <form onSubmit={submit} aria-label="Add a pronunciation" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Word or name" hint="As it is written in your documents.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={100}
              value={draft.word}
              onChange={(event) => onDraft({ ...draft, word: event.target.value })}
            />
          )}
        </Field>
        <Field label="Say it as" hint="Spell it the way it sounds, e.g. “Kale” or “Doctor”.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={200}
              value={draft.sayAs}
              onChange={(event) => onDraft({ ...draft, sayAs: event.target.value })}
            />
          )}
        </Field>
      </div>
      <Checkbox
        checked={draft.matchCase}
        onCheckedChange={(matchCase) => onDraft({ ...draft, matchCase })}
        label="Only when the letter case matches (for example “US” but not “us”)"
      />
      {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          icon={draft.id ? undefined : <Plus size={15} />}
          loading={save.isPending}
          disabled={!ready}
        >
          {draft.id ? 'Save changes' : 'Add word'}
        </Button>
        <Button
          icon={<Volume2 size={15} />}
          disabled={draft.sayAs.trim() === ''}
          onClick={() => onHear(draft.sayAs)}
        >
          Hear it
        </Button>
        {draft.id ? <Button onClick={() => onDraft(EMPTY)}>Cancel</Button> : null}
      </div>
    </form>
  );
}

function RuleRow({
  rule,
  onEdit,
  onHear,
}: Readonly<{ rule: Pronunciation; onEdit: () => void; onHear: () => void }>) {
  const remove = useDeletePronunciation();
  return (
    <li className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{rule.word}</span>
        <span className="text-muted"> → </span>
        <span>{rule.sayAs}</span>
        {rule.matchCase ? (
          <Badge className="ml-2" tone="neutral">
            Exact case
          </Badge>
        ) : null}
      </div>
      <IconButton
        size="sm"
        label={`Hear ${rule.word}`}
        icon={<Volume2 size={15} />}
        onClick={onHear}
      />
      <IconButton
        size="sm"
        label={`Change ${rule.word}`}
        icon={<Pencil size={15} />}
        onClick={onEdit}
      />
      <IconButton
        size="sm"
        label={`Remove ${rule.word}`}
        icon={<Trash2 size={15} />}
        disabled={remove.isPending}
        onClick={() => remove.mutate(rule.id)}
      />
    </li>
  );
}

export function PronunciationSection() {
  const rules = usePronunciations();
  const preview = useVoicePreview();
  const { state } = usePlayer();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const hear = (text: string) => void preview.play(state.voiceId, text);
  return (
    <Section
      id="pronunciation"
      title="Pronunciation"
      description="Teach the voices how to say names and words. Applies to every document and export."
    >
      <div className="flex flex-col gap-5">
        <RuleForm draft={draft} onDraft={setDraft} onHear={hear} />
        {preview.state.error ? <Banner tone="error">{preview.state.error.message}</Banner> : null}
        {rules.isPending ? <Skeleton className="h-16" /> : null}
        {rules.isError ? <Banner tone="error">{describeError(rules.error)}</Banner> : null}
        {rules.data && rules.data.length > 0 ? (
          <ul aria-label="Pronunciations" className="flex flex-col">
            {rules.data.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onHear={() => hear(rule.word)}
                onEdit={() =>
                  setDraft({
                    id: rule.id,
                    word: rule.word,
                    sayAs: rule.sayAs,
                    matchCase: rule.matchCase,
                  })
                }
              />
            ))}
          </ul>
        ) : null}
        {rules.data?.length === 0 ? (
          <p className="text-[13px] text-muted">
            No words yet. Character names and made-up places are the usual candidates.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
