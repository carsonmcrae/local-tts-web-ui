// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The document's cast: who reads its dialogue, and the sentences given their own voice or effect.
 * Scope: A "Voices & effects" button opening a dialog that explains how to style sentences (select
 *   text, or style the sentence being read), chooses the voice for all quoted dialogue, counts the
 *   styled sentences and clears them all. The player then fetches the new audio.
 * Does NOT belong: Styling chosen sentences (SentenceStyling) or synthesis.
 */
import { Drama } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useVoices } from '@/api/queries';
import { useDialogueVoice, useStyleSentences } from '@/api/stylingQueries';
import type { DocumentStyles, SentenceStyle } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { StyleSentencesDialog } from './SentenceStyling';

export function CastButton({
  documentId,
  styling,
  activeIndex,
  onChanged,
}: Readonly<{
  documentId: string;
  styling: DocumentStyles | undefined;
  activeIndex: number | null;
  onChanged: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const [styleActive, setStyleActive] = useState(false);
  const voices = useVoices();
  const dialogue = useDialogueVoice(documentId);
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
            hint="Reads every sentence with quoted speech, unless the sentence has its own voice."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={styling?.dialogueVoiceId ?? ''}
                disabled={dialogue.isPending}
                onChange={(event) =>
                  dialogue.mutate(event.target.value || null, { onSuccess: onChanged })
                }
              >
                <option value="">The reading voice</option>
                {available.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.category === 'custom'
                      ? `${voice.name} (custom)`
                      : `${voice.name} · ${voice.language}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
                    },
                    { onSuccess: onChanged },
                  )
                }
              >
                Clear all
              </Button>
            </div>
          ) : null}
          {dialogue.isError ? <Banner tone="error">{describeError(dialogue.error)}</Banner> : null}
          {clear.isError ? <Banner tone="error">{describeError(clear.error)}</Banner> : null}
        </div>
      </Dialog>
      {styleActive && activeIndex !== null ? (
        <StyleSentencesDialog
          documentId={documentId}
          indexes={[activeIndex]}
          styles={byIndex}
          onClose={() => setStyleActive(false)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
