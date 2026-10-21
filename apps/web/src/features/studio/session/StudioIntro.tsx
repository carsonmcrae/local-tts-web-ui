// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Explain a studio voice session before it starts: what it does and how to set up.
 * Scope: How the voice is built from the session, the microphone and room setup that avoids a thin
 *   ("tinny") sound, pausing and resuming, the engine needed to build, and what is stored.
 * Does NOT belong: The microphone check or recording controls.
 */
import { Clock3, Cpu, Mic, ShieldCheck, Sparkles } from 'lucide-react';
import { Point } from '../ReferenceExplainer';

export function StudioIntro() {
  return (
    <div className="flex flex-col gap-5">
      <Point icon={<Sparkles size={16} />} title="Built from your best takes">
        You’ll read short passages in different styles. The app measures every take, averages your
        voice across them, then builds and tests a few voices from your best takes so you can pick
        the one that sounds most like you. When it speaks, the engine hears about 10 seconds of one
        take for the sound of your voice, plus three takes of each speaking style for its rhythm. No
        model is trained, so the session stops asking once the voice has what it uses.
      </Point>
      <Point icon={<Mic size={16} />} title="A good microphone makes the biggest difference">
        Use a USB or XLR microphone, a hand’s width from your mouth and aimed slightly to the side.
        Laptop and headset mics often sound thin or “tinny”, and the voice copies that. On Windows,
        turn off Audio enhancements for your microphone in Sound settings.
      </Point>
      <Point icon={<Clock3 size={16} />} title="About 15–20 minutes, at your own pace">
        About 15 passages (2–3 minutes of speech) give a complete voice; the app suggests which
        ones, and the rest are optional. Every take is saved as you go, so you can stop and continue
        later. Already recorded in Audacity or similar? Import it.
      </Point>
      <Point icon={<Cpu size={16} />} title="Building needs the voice-cloning engine">
        You can record now and install the engine before building. Building takes a minute or two
        with an NVIDIA GPU or Apple Silicon, longer on a CPU.
      </Point>
      <Point icon={<ShieldCheck size={16} />} title="Only voices you have permission to use">
        Record yourself, or someone who has agreed to it. Your recordings and the built voice stay
        on this computer, and deleting the voice deletes them too.
      </Point>
    </div>
  );
}
