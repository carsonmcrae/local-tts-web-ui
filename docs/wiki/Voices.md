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

No voice in TTSNative is a recording of a person. Each card has a one-line credit naming the model
behind the voice and its licence, and a **Credits** link to **Voice credits** at the end of the Voices
page, which gives the full wording for each source of voices once:

| Card credit                                       | Full wording, in Voice credits                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic voice · Kokoro-82M, Apache-2.0          | The Kokoro-82M model by hexgrad (Apache-2.0), which builds on StyleTTS 2 by yl4579, run with kokoro-onnx (MIT). Its authors say it was trained on permissively licensed and public-domain audio, including Koniwa by tnc (CC BY 3.0) and SIWIS (CC BY 4.0), and on synthetic speech from other text-to-speech systems; no speaker is named for any voice. TTSNative is not affiliated with the model's authors. |
| Synthetic voice · Chatterbox Turbo, MIT           | The voice built into Chatterbox Turbo by Resemble AI (MIT); its origin is not documented. Every clip carries Resemble AI's Perth watermark, designed to be inaudible.                                                                                                                                                                                                                                           |
| Consented synthetic clone · Chatterbox Turbo, MIT | **Your voices**: synthetic speech from Chatterbox Turbo conditioned on a recording made with the speaker's consent; it is not that recording. Its clips are watermarked too.                                                                                                                                                                                                                                    |
| Synthetic blend · Kokoro-82M, Apache-2.0          | **Blends**: a weighted mix of built-in Kokoro voices, with the Kokoro credit above.                                                                                                                                                                                                                                                                                                                             |

Each engine's licence is also shown in **Settings → Engines & models**. The Windows app keeps the licence
texts and notices of everything it ships, the voice model's included, in `THIRD-PARTY-NOTICES.txt` and
the `licenses` folder of `%LOCALAPPDATA%\TTSNative\runtime`. The exact models and files, with their
checksums, are listed in
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
