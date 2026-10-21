# Voice Studio

Voice Studio creates a narration voice from your own recordings, or from those of someone who has given
you permission. It's optional: the reader and its 54 built-in voices work without it. There are two
ways to create a voice: a **quick voice** from one short recording, and a **studio voice** from a
longer guided session for the most faithful result.

## How it works

Voice Studio uses [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) by Resemble AI (MIT).
It copies a voice from a short reference recording at the moment it speaks ("zero-shot" cloning).

- **No model is trained.** Fine-tuning a model on 30+ minutes of speech can sound closer, but it needs
  hours of GPU time and isn't offered here.
- **The reference sets the sound.** The engine takes the voice's sound from roughly the first 10
  seconds of a reference and its speaking style from the first 15. A clean recording matters far more
  than a long one: a thin, "tinny" microphone makes a thin, tinny voice.
- **A studio session helps in two ways.** Instead of one clip, the app measures every take, averages
  the speaker's identity across the whole session, and builds the voice from the take that works best,
  which you choose by ear.
- **English.** In this app, Chatterbox Turbo is listed as an English engine. Multilingual cloning is on
  the [roadmap](https://github.com/carsonmcrae/ttsnative/blob/main/README.md#roadmap).

## What you need

|          |                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Engine   | Chatterbox Turbo, installed from **Settings → Engines & models** or from the Voice Studio page                |
| Hardware | Best with an NVIDIA GPU (4 GB+ VRAM) or Apple Silicon; 4 GB+ RAM. CPU works but is much slower than real time |
| Disk     | About +8 GB with NVIDIA CUDA (measured); about +4.5 GB CPU-only (estimated)                                   |
| Network  | A one-time download; the install button shows its size for the option you choose                              |

When you install, you choose how to run it. **NVIDIA GPU (CUDA)** is offered, and recommended, when an
NVIDIA graphics card is detected (not on macOS). Otherwise the option is **CPU only**, shown as
**Apple Silicon / CPU** on a Mac. The engine goes into its own isolated environment under
`data/engines/chatterbox`, separate from the main app, and is only marked as installed after the model
has loaded successfully.

To free memory, the engine unloads after 10 minutes without use; the next generation loads it again.
You can record and save voices before installing the engine, but you need it to hear them.

## Creating a voice

Press **Create voice** on the Voice Studio page and choose **Quick voice** or **Studio voice**.

### Quick voice

About two minutes. A wizard guides you through five steps.

1. **Before you start.** A short explanation of how cloning works, what is stored, consent and the
   watermark.
2. **Record.** Read the passage on screen aloud (about 20 seconds); **Different passage** offers
   another. **Start recording** shows a level meter and a timer; aim for about 20 seconds, then press
   **Stop recording**. Recording stops by itself at 45 seconds. Alternatively, **Import a recording**:
   an audio file of up to 20 MB that your browser can decode, such as WAV, MP3, M4A or FLAC. Only
   the first 45 seconds are kept.
3. **Check.** Listen back and read the quality checks. Errors must be fixed with **Record again**;
   warnings don't stop you. **Clean up the recording** lets you reduce background noise, filter out
   low rumble and adjust the tone by ear (see [Cleaning up a recording](#cleaning-up-a-recording));
   the voice is made from the cleaned-up copy.
4. **Name & consent.** Enter a **Voice name** (up to 60 characters) and tick the permission statement,
   then press **Create voice**.
5. **Try it.** Edit the test sentence if you like and press **Generate sample**. The first generation
   loads the model and can take a little while. **Use for reading** makes it your reading voice. If the
   engine isn't installed yet, this step offers to install it instead.

### Studio voice

About 15–20 minutes, and you can stop and continue later: every take is saved as you go, and Voice
Studio shows **Studio session in progress** with **Continue** and **Discard**. Use a USB or XLR
microphone if you can. The [recording guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/studio-recording.md)
covers microphone, Windows and room setup.

1. **Before you start.** How the voice is built, microphone and room setup, and what is stored.
2. **Microphone.** Voice Studio picks the input that looks like a USB or XLR microphone (you can choose
   another). Press **Check microphone**, stay quiet for two seconds, then read the line on screen. The
   check reports level, background noise, clipping and the microphone's tone. **Clean up the
   recording** starts from the cleanup the app suggests for your microphone and room (see
   [Cleaning up a recording](#cleaning-up-a-recording)); **Play original** and **Play cleaned up**
   let you compare. The cleanup you choose applies to every take in the session. Your takes are kept
   as recorded; the voice is built from cleaned-up copies.
3. **Record.** Start with the **foundation passage** (about a minute, read as one story), then 48
   short passages in six styles (narration, storytelling, conversation, questions, numbers and names,
   calm). Under each passage, **How to read it** says which inflection and pauses it teaches: where to
   pause, which words to lean on, where a question rises. Press **Record**, read the passage, then
   **Stop**. Each take is recorded losslessly (browser noise suppression, echo cancellation and
   auto-gain are off), checked and saved at once; a good take moves you to the next passage.
   **Listen to this take** plays it back before you decide whether to record it again, and **All
   passages** jumps to any passage, showing which are recorded, have advice or need another take.
   You don't need all 48. The session shows what the voice will use and suggests the **most useful
   next** passage (**Go to it** jumps there):
   - **Foundation:** the foundation passage plus 45 seconds of speech in all. You can build a working
     voice, but questions and lively lines may sound less like you.
   - **Developing:** twelve clean takes. The sound of your voice has settled; more takes hardly move it.
   - **Complete:** every speaking style (narration, questions, lively lines, dialogue, calm) has its
     three takes. That is about 15 passages, 2–3 minutes of speech. More passages won't change the
     voice, so the session says you can build.

   No model is trained at any tier: when the voice speaks, it hears about 10 seconds of one take for
   its sound and three takes of the sentence's style for its rhythm (see the
   [studio voice audit](https://github.com/carsonmcrae/ttsnative/blob/main/docs/research/studio-voice-audit.md)).
   Recorded elsewhere? **Import a recording** splits a WAV, FLAC or OGG file (up to 30 minutes) into
   takes at its pauses; an import with 5 minutes of speech can be built without the passages' styles.

4. **Build.** Press **Build my voice**. The app measures every take, averages your voice across the
   session, builds and tests five voices from your best takes, and learns your [speaking
   styles](#expression). This takes a minute or two with a GPU, longer on a CPU, and needs the
   voice-cloning engine (this step offers to install it).
5. **Choose.** Listen to the samples of the three best voices, each with a match score, and pick the
   one that sounds most like the speaker.
6. **Name & consent** and 7. **Try it**, as for a quick voice.

### Cleaning up a recording

Both kinds of voice offer the same cleanup controls after their check. The voice copies whatever it
hears in the recording, so a quieter background or a more natural tone carries into every sentence
it reads.

| Control                    | What it does                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Background noise reduction | Turns down steady noise, such as a fan, a computer or room hiss, wherever your voice isn't louder than it. 0% is off; 100% is strongest. |
| Filter out low rumble      | Removes sound below about 80 Hz, such as traffic, air conditioning or bumps on the desk.                                                 |
| Treble                     | Lowers harsh 4 kHz-and-up energy from a bright microphone (down to −9 dB).                                                               |
| Low end                    | Adds warmth below about 250 Hz to a thin microphone (up to +6 dB).                                                                       |

- **Suggestions.** The app measures the quiet moments of the recording (the two seconds of silence
  in a microphone check) and suggests noise reduction when the background is audible, the rumble
  filter when that background is mostly low rumble, and tone changes for a bright or thin
  microphone. **Use suggested** applies the suggestion.
- **Listen before you decide.** **Play original** and **Play cleaned up** compare the two. The cleaned
  version is made on your computer each time you change a setting and press play. Strong noise
  reduction can make a voice sound slightly watery, so use the lowest setting that sounds clean.
- **Carried forward.** The cleanup you last used is remembered in this browser and is the starting
  point for your next recording, since the microphone and room are usually the same.
  **Use suggested** and **Turn cleanup off** are always available.
- **Your recordings are never changed.** The cleanup is applied to copies when the voice is made.
- Noise reduction uses stationary spectral gating, following the approach of
  [noisereduce](https://github.com/timsainb/noisereduce) by Tim Sainburg (MIT). It is re-implemented
  in the app, so nothing extra is installed.

### Delivery

Each voice has a **Delivery**: **Steady** (even, good for long reading), **Natural** (the default)
or **Expressive** (more rise and fall, less even from sentence to sentence). Change it in the wizard's
last step or on the voice card; audio made with the previous delivery is cleared.

### Expression

The cloning model takes a voice's rhythm and inflection from about 15 seconds of one recording, so a
voice built from a single take reads every sentence the same way. A studio voice keeps a **speaking
style** for each kind of sentence, learnt from your takes of the matching passages: **questions**
(from the questions passages), **lively lines** (exclamations), **dialogue** (animated quoted speech)
and **narration**. Each sentence is read in the style its punctuation asks for, so a question rises
the way your own questions do. The voice's sound stays the same in every style.

Studio voices built before this existed show **Improve expression** on their card: it learns the
styles from the takes the voice kept (a minute or two with a GPU). The card lists the styles a voice
has, and **Rebuild expression** learns them again.

Every sentence a custom voice speaks is also checked: one that comes out far too short or too long for
its text (cut off, or running on with noise) is generated again, and every sentence is levelled to the
same loudness as the built-in voices, with silent edges trimmed and overly long pauses shortened.

### Sharing a voice

**Share** on a voice card saves the voice as a `.ttsvoice` file that someone else can import into
their own TTSNative. It holds the built voice, its speaking styles and one short reference clip, plus
the consent statement it was created under. Your session recordings stay on this computer. Anyone
who has the file can make the voice say anything, so you confirm that it's your voice (or that its
owner agreed to it being shared) before the download starts.

**Import a voice** (top of Voice Studio) adds a `.ttsvoice` file someone shared with you. As soon as
you choose the file, the app checks it completely — only the expected files, each once and within size
limits, every checksum, the reference audio, and each voice file's format and contents (it never runs
code from the file) — and shows what it holds: the name, description and creator it was shared with,
whether it's a studio or quick voice, its speaking styles, its size and the app version that made it.
Then you confirm you have the voice owner's permission. Imported voices are marked **Shared** and never
replace one of yours: a name already in use gets "(2)" added. A file from a newer TTSNative says so and
asks you to update. The format is described in
[the `.ttsvoice` reference](https://github.com/carsonmcrae/ttsnative/blob/main/docs/reference/ttsvoice-format.md).

## Recording tips

- Use a quiet room, keep the microphone about a hand's width away, and read at your normal pace.
- Read continuously. More than half the recording being silence triggers a warning.
- Keep quiet lines voiced rather than whispered: the voice copies a whisper poorly, and a whispered
  take is often too quiet to use.
- **How to read it** under each passage is a suggestion: the varied inflection is what teaches the
  voice to sound like you in questions, dialogue and lively lines, but read in your own natural voice —
  there's no need to exaggerate.
- Browsers only allow recording on `localhost` or HTTPS pages. On another device over your network,
  import a recording instead (see [Other Devices](Other-Devices)).
- If the browser blocks the microphone, allow it in the browser's site settings and try again.

## Quality checks

Your browser shows instant checks; the local server then repeats them, and its result decides.

| Check            | Blocks the voice (error)  | Advice only (warning)                   |
| ---------------- | ------------------------- | --------------------------------------- |
| Amount of speech | Less than 6 seconds       | Less than 10 seconds                    |
| Loudness         | Very quiet                | A little quiet                          |
| Clipping         | Distorted audio           | A few clipped peaks                     |
| Background noise | A lot of background noise | Some audible noise                      |
| Pauses           | None                      | More than half the recording is silence |
| Tone: bright     | None                      | Vowels carry harsh 4–8 kHz energy       |
| Tone: thin       | None                      | Vowels have little low end              |

Tone is measured on vowels only: "s" and "sh" sounds are naturally bright and are left out, so a good
microphone close to the mouth isn't flagged. A tone or noise warning comes with a suggested
[cleanup](#cleaning-up-a-recording). Each problem comes with a plain-language fix, such as moving
closer to the microphone.

**Studio takes** are judged on what really went wrong, so a take you stop straight away gets one
message (nothing was heard, or the take stopped before the reading started) instead of every
measurement that follows from it. A take needs 3 seconds of speech; a very quiet voice is named as the
cause of a short take. Two further checks are advice only, so the take still counts:

- **Completeness:** the app estimates how much of the passage you read, from the syllables it hears and
  how long you spoke, and after three takes it calibrates to your own pace. A take that seems to stop
  early or skip a part says so.
- **Background noise:** a lot of noise, or noise clearly louder than in your other takes (a fan, traffic,
  voices), suggests recording that take again. Noisy takes still count towards your speech, but are
  never used to give the voice its sound.

Studio takes skip the tone checks, since the microphone check covers them, and the microphone check
needs 2 seconds of speech.

## Consent and responsible use

Only create voices you have the right to use. Before a voice can be created, you must tick this
statement:

> I am the person speaking in this recording, or I have their explicit permission to create and use a
> synthetic copy of their voice (for a child, a parent's or guardian's; for someone who has died, their
> estate's). I won't use it to impersonate or deceive anyone, to pass generated speech off as a real
> recording, or in any way that breaks the law or someone's rights.

The server refuses to create a voice without it (whether you use the app or call its API) and stores
the statement's wording and when you confirmed with the voice. Each voice card shows "Consent
confirmed" with the date.

TTSNative runs entirely on your computer, so what you record, generate and share is up to you, and so
is the responsibility for it: you need the speaker's permission, and you're responsible for how you use
and publish the audio. Speech made with Chatterbox carries Resemble AI's imperceptible Perth watermark,
added by Chatterbox itself; TTSNative doesn't remove it, but a watermark can't prevent misuse, and its
survival through MP3 export hasn't been tested here. Kokoro's built-in voices are not watermarked.

## What is stored

For a quick voice, only a trimmed copy of the reference recording (a WAV of at most 30 seconds) is
saved, in `data/voices/`, with the voice's name and details in the library database. A studio voice
also keeps its session's takes (24-bit FLAC), the voice built from them and its speaking styles (small
safetensors files). A shared voice keeps the built voice, its styles, a short reference and where it
came from (`origin.json`), but no takes.
Sessions in progress live in `data/voices/sessions/`. No model is trained and nothing is uploaded.
You can have up to 50 custom voices.

Each voice card has **Play recording**, a **Delivery** choice, the voice's
[expression](#expression) and **Use for reading** (once the engine is installed), **Share**, a rename
button and a delete button. Studio voices are marked **Studio**, imported ones **Shared**.

## Permanent deletion

Use the delete button on a voice card and confirm **Delete voice**. This permanently removes the
voice's recordings (including a studio voice's session takes), the voice profile and the cached audio
generated with that voice. **Discard** does the same for a studio session in progress. It can't be
undone. If it was your reading voice, the reader switches back to **Heart**.

Audio you exported with the voice isn't removed: delete downloaded files, and the copies in
`data/exports/`, yourself (see [Exporting Audio](Exporting-Audio#where-exports-go)).

## Watermark

Every clip Chatterbox generates carries Resemble AI's inaudible Perth watermark, which identifies the
audio as synthetic.
