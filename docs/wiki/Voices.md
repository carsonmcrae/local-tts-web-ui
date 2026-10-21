# Voices

## The voice library

The **Voices** page lists every voice you can read with:

- the **54 built-in Kokoro voices**, installed with the default voice model;
- **your voices**, created in [Voice Studio](Voice-Studio);
- **Chatterbox default**, the cloning engine's own built-in English voice, which becomes available if
  you install the optional Chatterbox Turbo engine.

Each card shows the voice's name, language, gender and engine, whether it's **Built-in** or
**Custom**, and its quality grade. Voices whose engine isn't installed are marked
**Engine not installed** and can't be previewed or chosen yet.

Narrow the list with the search box (name or language) and the **Language**, **Gender** and
**Source** filters (**All voices**, **Built-in** or **Your voices**).

## Every voice is synthetic

No voice in TTSNative is a recording of a person. Each card says where its voice comes from and under
what licence:

- **Kokoro voices** are produced by the Kokoro-82M model (Apache-2.0, by hexgrad), run with
  kokoro-onnx (MIT). Its authors say it was trained on permissively licensed and public-domain audio,
  including synthetic speech from other systems, and do not say whose speech each voice was trained on.
- **Chatterbox default** is the voice built into Chatterbox Turbo (MIT, Resemble AI); its origin is
  not documented. Every Chatterbox clip carries an inaudible watermark.
- **Your voices** are synthetic speech from Chatterbox Turbo conditioned on the recording you made
  with the speaker's consent; they are not that recording, and their clips are watermarked too.
- **Blends** are weighted mixes of Kokoro voices.

The exact models and files, with their checksums, are listed in
[docs/security/model-provenance.md](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/model-provenance.md).

## Languages

| Language         | Kokoro voices |
| ---------------- | ------------- |
| English (US)     | 20            |
| English (UK)     | 8             |
| Spanish          | 3             |
| French           | 1             |
| Hindi            | 4             |
| Italian          | 2             |
| Portuguese (BR)  | 3             |
| Japanese         | 5             |
| Mandarin Chinese | 8             |

Each voice speaks its own language, so choose one that matches your document. The Japanese and
Mandarin voices carry a note that their pronunciation uses a generic phonemiser and may be rough.

## Quality grades

The letter on each card is the upstream Kokoro model's own quality rating for that voice, published
by its authors; **A is best**. A few voices (the Spanish and Portuguese ones) have no published grade,
and custom voices aren't graded.

The highest-graded voices are **Heart** (A, US English, the default) and **Bella** (A-, US English),
followed by **Nicole** (US English), **Emma** (UK English) and **Siwis** (French), all B-.

## Comparing voices

Grades are a guide, but your ears decide. To compare voices fairly:

1. Type up to 400 characters into **Comparison passage**, ideally a sentence from your own document.
   Leave it empty to use a standard sample.
2. Press **Preview** on each voice you're interested in. Every preview speaks the same passage.
3. Press **Stop** to end a preview early. Only one plays at a time.

Previews are generated on your computer at your speaking pace from **Settings → Playback**. Playing
the same preview again reuses the audio already generated.

## Blending voices

**Blend voices** (top of the Voices page, once the built-in voices are installed) mixes two to four
built-in voices into a new one. Choose the voices and how much of the mix each one gets; the blend then
appears in the voice list like any other voice, to preview, read with or give to a character.

- Only built-in Kokoro voices can be blended. Each is described by a set of numbers, and a blend is
  their weighted average. Cloned voices copy one person's recording and can't be mixed.
- A blend reads with the first voice's accent and pronunciation rules, whatever the others are.
- A blend can't be changed once made (so audio made with it stays right); make a new one instead.
  Delete blends under **Your blends**: sentences set to read with one go back to the reading voice.

## Setting the reading voice

There are three ways to choose the voice the reader uses:

- On the **Voices** page, press **Use for reading** on a card. That card then shows a **Default**
  badge and a **Reading voice** button.
- In the player bar, click the voice button. The list is searchable, shows your voices first, then the
  built-in voices grouped by language, with their grades.
- In **Settings → Playback**, choose a **Default voice**.

Each of these switches the player immediately and saves the voice as your default. Preferences are
stored by the local server, so every browser that opens the app uses the same default voice.

## Custom voices

Voices you create in [Voice Studio](Voice-Studio) appear under **Your voices**. They need the optional
Chatterbox Turbo engine to be heard; until it's installed, you can save them but not use them for
reading.
