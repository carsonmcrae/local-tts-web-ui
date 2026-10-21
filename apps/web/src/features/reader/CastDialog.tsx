// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The document's cast: who reads its dialogue and characters, and the sentences styled apart.
 * Scope: A "Voices & effects" button opening a dialog that:
 *   - explains how to style sentences (select text, or style the sentence being read);
 *   - chooses the voice for all quoted dialogue, and whether quoted speech inside a narrated sentence
 *     gets that voice while the narration keeps the reading voice;
 *   - gives the book's characters their own voices (CharacterCast);
 *   - counts the styled sentences and clears them all.
 *   The player then fetches the new audio.
 * Does NOT belong: Styling chosen sentences (StyleSentencesDialog) or synthesis.
 */
import { Drama } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useVoices } from '@/api/queries';
import { useCast, useStyleSentences } from '@/api/stylingQueries';
import type { DocumentStyles, SentenceStyle } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select, Switch } from '@/components/ui/Field';
import { CharacterCast } from './CharacterCast';
import { StyleSentencesDialog, voiceLabel } from './StyleSentencesDialog';

export function CastButton({
  documentId,
  styling,
  activeIndex,
  voiceId,
  onChanged,
}: Readonly<{
  documentId: string;
  styling: DocumentStyles | undefined;
  activeIndex: number | null;
  voiceId: string;
  onChanged: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const [styleActive, setStyleActive] = useState(false);
  const voices = useVoices();
  const cast = useCast(documentId);
  const clear = useStyleSentences(documentId);
  const styled = styling?.segments ?? [];
  const byIndex = new Map<number, SentenceStyle>(styled.map((style) => [style.index, style]));
  const available = (voices.data ?? []).filter((voice) => voice.available);

  return (
    <>
      <Button variant="ghost" size="sm" icon={<Drama size={14} />} onClick={() => setOpen(true)}>
        Voices & effects
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Voices and effects"
        description="Give characters their own voices and add effects to chosen lines."
      >
        <div className="flex flex-col gap-5 text-sm leading-relaxed">
          <p className="text-muted">
            Select any text in the document, then choose <strong>Voice & effect</strong>: read those
            sentences in another voice or accent, as a loudspeaker announcement or a phone call, or
            with a sound before them.
          </p>
          {activeIndex === null ? null : (
            <div>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setStyleActive(true);
                }}
              >
                Style the sentence being read
              </Button>
            </div>
          )}
          <Field
            label="Dialogue voice"
            hint="Reads quoted speech, unless the sentence or its character has a voice of its own."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={styling?.dialogueVoiceId ?? ''}
                disabled={cast.isPending}
                onChange={(event) =>
                  cast.mutate(
                    { dialogueVoiceId: event.target.value || null },
                    { onSuccess: onChanged },
                  )
                }
              >
                <option value="">The reading voice</option>
                {available.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voiceLabel(voice)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Switch
            checked={styling?.splitDialogue ?? true}
            onCheckedChange={(splitDialogue) =>
              cast.mutate({ splitDialogue }, { onSuccess: onChanged })
            }
            label="Narrator reads the narration"
            description='In “"Run!" she shouted.”, only the quoted words get the dialogue or character voice.'
          />
          <CharacterCast documentId={documentId} onChanged={onChanged} />
          {styled.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted">
                {styled.length === 1 ? '1 sentence has' : `${styled.length} sentences have`} their
                own voice or effect.
              </p>
              <Button
                size="sm"
                variant="ghost"
                loading={clear.isPending}
                onClick={() =>
                  clear.mutate(
                    {
                      indexes: styled.map((style) => style.index),
                      voiceId: null,
                      effect: null,
                      sound: null,
                      style: null,
                      pauseMs: null,
                      take: null,
                    },
                    { onSuccess: onChanged },
                  )
                }
              >
                Clear all
              </Button>
            </div>
          ) : null}
          {cast.isError ? <Banner tone="error">{describeError(cast.error)}</Banner> : null}
          {clear.isError ? <Banner tone="error">{describeError(clear.error)}</Banner> : null}
        </div>
      </Dialog>
      {styleActive && activeIndex !== null ? (
        <StyleSentencesDialog
          documentId={documentId}
          indexes={[activeIndex]}
          styles={byIndex}
          voiceId={voiceId}
          onClose={() => setStyleActive(false)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
