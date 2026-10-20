// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Explain, honestly, how a quick voice works before anyone records.
 * Scope: Short references vs. studio sessions vs. fine-tuned models (and which ones this app uses),
 *   what is stored, consent, and the watermark on generated audio. Exports the explainer point layout.
 * Does NOT belong: Recording controls.
 */
import { Clock3, Cpu, ShieldCheck, Waves } from 'lucide-react';
import type { ReactNode } from 'react';

/** One explained point: an icon, a short title and a sentence or two. */
export function Point({
  icon,
  title,
  children,
}: Readonly<{ icon: ReactNode; title: string; children: ReactNode }>) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

export function ReferenceExplainer() {
  return (
    <div className="flex flex-col gap-5">
      <Point icon={<Clock3 size={16} />} title="A short reference is all a quick voice needs">
        Chatterbox copies a voice from a 10–20 second sample at the moment it speaks (“zero-shot”
        cloning). You’ll read one passage, about 20 seconds long.
      </Point>
      <Point icon={<Waves size={16} />} title="A clean clip matters more than a long one">
        The engine only listens to roughly the first 10–15 seconds of speech, so one steady sample
        is enough here. For your most faithful voice, create a studio voice instead: a longer guided
        session that the app builds from your best takes.
      </Point>
      <Point icon={<Cpu size={16} />} title="No model training (fine-tuning)">
        A fine-tuned model is trained on 30+ minutes of speech for hours on a GPU. It can sound
        closer, but this app doesn’t do it: zero-shot cloning is faster, private and good for
        narration.
      </Point>
      <Point icon={<ShieldCheck size={16} />} title="Only voices you have permission to use">
        You’ll confirm that the voice is yours or that the speaker agreed. Generated audio carries
        Resemble AI’s inaudible Perth watermark identifying it as synthetic. Everything stays on
        this computer.
      </Point>
    </div>
  );
}
