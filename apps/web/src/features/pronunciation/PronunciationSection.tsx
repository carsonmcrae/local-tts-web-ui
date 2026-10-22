// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → Pronunciation: teach the voices how to say names and words.
 * Scope: Add a word with how it should be said (written the way it sounds, optionally matching its
 *   exact letter case), hear the word as written and the respelling side by side in the current
 *   reading voice before saving, list every rule with its scope (all documents, or one document),
 *   change a rule (moving one document's rule to all documents) or remove it. Only what is spoken
 *   changes, never the text; only sentences containing a changed word get new audio.
 * Does NOT belong: Matching and storing the rules (the server) or the reader's dialog
 *   (FixPronunciationDialog).
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
import { Checkbox, Field, Select } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { usePlayer } from '@/features/player/PlayerProvider';
import { scopeLabel } from './pronunciationRules';
import { RespellingFields } from './RespellingFields';
import type { PronunciationPreview } from './usePronunciationPreview';
import { usePronunciationPreview } from './usePronunciationPreview';

interface Draft {
  id?: string;
  word: string;
  sayAs: string;
  matchCase: boolean;
  documentId: string | null;
  /** The document a rule being changed was made for (it can stay there or apply to all). */
  document?: { id: string; title: string };
}

const EMPTY: Draft = { word: '', sayAs: '', matchCase: false, documentId: null };
const ALL = '';

function ScopeField({
  draft,
  onDraft,
}: Readonly<{ draft: Draft; onDraft: (draft: Draft) => void }>) {
  const { document } = draft;
  if (!document) return null;
  return (
    <Field
      label="Use it in"
      hint="A rule for one document wins there over a rule for all documents."
    >
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={draft.documentId ?? ALL}
          onChange={(event) => onDraft({ ...draft, documentId: event.target.value || null })}
        >
          <option value={document.id}>Only “{document.title}”</option>
          <option value={ALL}>All documents</option>
        </Select>
      )}
    </Field>
  );
}

function RuleForm({
  draft,
  onDraft,
  preview,
}: Readonly<{ draft: Draft; onDraft: (draft: Draft) => void; preview: PronunciationPreview }>) {
  const save = useSavePronunciation();
  const ready = draft.word.trim() !== '' && draft.sayAs.trim() !== '';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { id, word, sayAs, matchCase, documentId } = draft;
    // The button is disabled until both fields are filled, so a submitted form is always ready.
    save.mutate(
      { ...(id ? { id } : {}), word, sayAs, matchCase, documentId },
      { onSuccess: () => onDraft(EMPTY) },
    );
  };
  return (
    <form onSubmit={submit} aria-label="Add a pronunciation" className="flex flex-col gap-4">
      <RespellingFields
        word={draft.word}
        sayAs={draft.sayAs}
        onWord={(word) => onDraft({ ...draft, word })}
        onSayAs={(sayAs) => onDraft({ ...draft, sayAs })}
        preview={preview}
      />
      <Checkbox
        checked={draft.matchCase}
        onCheckedChange={(matchCase) => onDraft({ ...draft, matchCase })}
        label="Only when the letter case matches (for example “US” but not “us”)"
      />
      <ScopeField draft={draft} onDraft={onDraft} />
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
        <Badge className="ml-2" tone={rule.documentId ? 'accent' : 'neutral'}>
          {scopeLabel(rule)}
        </Badge>
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

function editing(rule: Pronunciation): Draft {
  const documentId = rule.documentId ?? null;
  return {
    id: rule.id,
    word: rule.word,
    sayAs: rule.sayAs,
    matchCase: rule.matchCase,
    documentId,
    ...(documentId
      ? { document: { id: documentId, title: rule.documentTitle ?? 'This document' } }
      : {}),
  };
}

export function PronunciationSection() {
  const rules = usePronunciations();
  const { state } = usePlayer();
  const preview = usePronunciationPreview(state.voiceId, state.pace);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  return (
    <Section
      id="pronunciation"
      title="Pronunciation"
      description="Teach the voices how to say names and words. Your text stays as written; only what is spoken changes, in playback and exports."
    >
      <div className="flex flex-col gap-5">
        <RuleForm draft={draft} onDraft={setDraft} preview={preview} />
        <p className="text-[13px] text-muted">
          Words added here apply to every document. To fix a word in one document only, select it
          while reading and choose Fix pronunciation.
        </p>
        {rules.isPending ? <Skeleton className="h-16" /> : null}
        {rules.isError ? <Banner tone="error">{describeError(rules.error)}</Banner> : null}
        {rules.data && rules.data.length > 0 ? (
          <ul aria-label="Pronunciations" className="flex flex-col">
            {rules.data.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onHear={() => void preview.hear('respelling', rule.sayAs)}
                onEdit={() => setDraft(editing(rule))}
              />
            ))}
          </ul>
        ) : null}
        {rules.data?.length === 0 ? (
          <p className="text-[13px] text-muted">
            No words yet. Character names, made-up places and borrowed words are the usual
            candidates.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
