# Voice Studio

Voice Studio creates a narration voice from a short recording of yourself, or of someone who has given
you permission. It's optional: the reader and its 54 built-in voices work without it.

## How it works

Voice Studio uses [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) by Resemble AI (MIT).
It copies a voice from a short reference recording at the moment it speaks ("zero-shot" cloning).

- **No model is trained.** Fine-tuning a model on 30+ minutes of speech can sound closer, but it needs
  hours of GPU time and isn't offered here.
- **Short is enough.** The engine only uses roughly the first 10–15 seconds of speech, so 10–20 seconds
  is ideal and longer recordings don't help. A clean, steady sample matters far more than length.
- **English.** In this app, Chatterbox Turbo is listed as an English engine. Multilingual cloning is on
  the [roadmap](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/README.md#roadmap).

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

Press **Create voice** on the Voice Studio page. A wizard guides you through five steps.

1. **Before you start.** A short explanation of how cloning works, what is stored, consent and the
   watermark.
2. **Record.** Read the passage on screen aloud (about 20 seconds); **Different passage** offers
   another. **Start recording** shows a level meter and a timer; aim for about 20 seconds, then press
   **Stop recording**. Recording stops by itself at 45 seconds. Alternatively, **Import a recording**:
   an audio file of up to 20 MB that your browser can decode, such as WAV, MP3, M4A or FLAC. Only
   the first 45 seconds are kept.
3. **Check.** Listen back and read the quality checks. Errors must be fixed with **Record again**;
   warnings don't stop you.
4. **Name & consent.** Enter a **Voice name** (up to 60 characters) and tick the permission statement,
   then press **Create voice**.
5. **Try it.** Edit the test sentence if you like and press **Generate sample**. The first generation
   loads the model and can take a little while. **Use for reading** makes it your reading voice. If the
   engine isn't installed yet, this step offers to install it instead.

## Recording tips

- Use a quiet room, keep the microphone about a hand's width away, and read at your normal pace.
- Read continuously. More than half the recording being silence triggers a warning.
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

Each problem comes with a plain-language fix, such as moving closer to the microphone.

## Consent and responsible use

Only create voices you have the right to use. Before a voice can be created, you must tick this
statement:

> I am the person speaking in this recording, or I have the speaker's explicit permission to create
> and use a synthetic version of their voice. I will not use it to impersonate, deceive or harm anyone.

The server refuses to create a voice without it and records when you confirmed. Each voice card
shows "Consent confirmed" with the date.

## What is stored

Only a trimmed copy of the reference recording (a WAV of at most 30 seconds) is saved, in
`data/voices/`, with the voice's name and details in the library database. No model is trained and
nothing is uploaded. You can have up to 50 custom voices.

Each voice card has **Play recording**, a rename button, **Use for reading** (once the engine is
installed) and a delete button.

## Permanent deletion

Use the delete button on a voice card and confirm **Delete voice**. This permanently removes the
reference recording, the voice profile and the cached audio generated with that voice. It can't be
undone. If it was your reading voice, the reader switches back to **Heart**.

Audio you exported with the voice isn't removed: delete downloaded files, and the copies in
`data/exports/`, yourself (see [Exporting Audio](Exporting-Audio#where-exports-go)).

## Watermark

Every clip Chatterbox generates carries Resemble AI's inaudible Perth watermark, which identifies the
audio as synthetic.
