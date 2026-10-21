# A more natural voice library: audit, research and measurements

> **In short:** No new voice ships from this work, and that is the finding, not a failure of effort. No
> English speech source read today documents the speaker's authorization to have their recognisable voice
> reproduced and distributed (LibriVox material is public domain as audio and unresolved as identity; Common
> Voice forbids identifying speakers; Jenny (Dioco) comes closest), the preset-voice engines with permissive
> weights are rated below Kokoro on the one independent arena that lists it, and Piper's voices sit below
> Kokoro in every comparison while inheriting research-licensed checkpoints. What did move the sound of
> every existing voice is the text layer: English voices now read money, times, phone numbers, years and
> abbreviations as a narrator does, every voice card says what model it comes from and that it is
> synthetic, and the measurements show that `kokoro-onnx` feeds Kokoro a phoneme transcription (espeak-ng)
> the model was not trained on (misaki): 60 of 61 benchmark sentences differ, several homographs with them.
> Three blind listening packs are ready for the owner. The proposals are a misaki phonemiser for Kokoro if
> the owner prefers it by ear, and a narrator programme that asks named LibriVox readers and Dioco for
> written authorization and ships their voices as checked `.ttsvoice` packs for the existing cloning
> engine, instead of a scraped library.

Research date: 2026-10-21. Branch `feat/voice-library`. Labels: **documented** (read on the cited page or in
this repository's code), **measured** (run on this computer), **claimed** (an author's own claim) and
**inference** (our reasoning). Licence notes repeat what pages say; they are not legal advice. Nothing was
merged, published or released; no model weights or voices were downloaded, the only downloads being Python
packages into a throw-away evaluation environment outside the app (section 8); and no page's instructions
to AI agents were acted on.

## 1. What TTSNative does today (audit, documented from the code)

### Engines and voices

| Question                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engines installed            | **Kokoro-82M v1.0** through `kokoro-onnx` 0.6.1 on onnxruntime 1.30 (in-process, `CPUExecutionProvider` pinned); **Chatterbox Turbo** (chatterbox-tts 0.1.7, torch 2.11) in its own uv environment under `data/engines/chatterbox`, driven over stdio JSON lines with `-I`, Hugging Face offline mode and no network, loaded on first use and unloaded after 10 idle minutes.                                                                          |
| Voice models                 | 54 Kokoro voices (`voices-v1.0.bin`, a NumPy archive read with `allow_pickle=False`), graded by upstream; the Chatterbox built-in voice (`conds.pt`, read with `torch.load(weights_only=True)`); custom voices made in Voice Studio (a reference WAV, or a built voice as safetensors with per-style prompts and an optional LoRA adapter); blends (weighted mixes of Kokoro style vectors).                                                           |
| How Kokoro narrates          | `engines/kokoro.py`: one ONNX session, text phonemised by espeak-ng (phonemizer 3.4 + espeakng-loader), one sentence per call, native pace 0.5–2.0, the voice's language code chosen per voice. The pinned export has a `duration` output, so phoneme timings are available (unused today).                                                                                                                                                            |
| How Studio Voice works       | Zero-shot conditioning, not training: a session's takes are measured, the speaker's identity is averaged, one take's first 10 s and 15 s become the sound and style prompts, and a style prompt per kind of sentence (narration, question, lively, dialogue, calm) is joined from up to three takes (ADR-9, ADR-11). An optional, experimental T3 LoRA fine-tune on the takes exists for NVIDIA GPUs (ADR-16); the owner's blind test of it was a tie. |
| Where voice choice is stored | `preferences` (one JSON row: `default_voice_id`), per-sentence voices in `segment_styles` and a document's dialogue voice in `document_cast` (SQLite); the reading voice is also saved with reading progress.                                                                                                                                                                                                                                          |
| Buffering and playback       | One clip per sentence; a content-addressed cache keyed by engine revision, voice, pace, boundary and the exact spoken text (plus style, take, effect and pause when set); a priority queue per engine (playback, prefetch, preview, export) served by one thread; the browser plays the current sentence and prefetches the next three.                                                                                                                |
| Highlighting                 | Sentence level, exact by construction (a clip is a sentence). There is no word-level highlighting; Kokoro's export could supply phoneme timings for one.                                                                                                                                                                                                                                                                                               |
| Model formats                | ONNX graph and a NumPy voice archive (Kokoro); safetensors for Chatterbox's T3, S3Gen and voice encoder, for built studio voices, styles and adapters; one PyTorch pickle (`conds.pt`) read with `weights_only`. No `trust_remote_code` anywhere; the worker runs with `HF_HUB_OFFLINE=1`.                                                                                                                                                             |
| Hardware                     | Kokoro: CPU only. Chatterbox: CUDA (cu126 wheels, Maxwell to Hopper), Apple MPS, or CPU (much slower than real time). `hardware.py` detects NVIDIA cards through `nvidia-smi` and Apple Silicon.                                                                                                                                                                                                                                                       |
| Optional downloads           | `modelstore/manifest.json`: exact URL, size and SHA-256 per file; HTTPS only; hosts allow-listed (GitHub releases, Hugging Face) and re-checked after every redirect; resumable `.part` files; retries; size and hash checked before an atomic rename; the install marker is written only after every file verifies; cancel, progress, free-disk reserve, repair of damaged files, remove.                                                             |
| Integrity before use         | `require_intact` hashes every file of an artifact before an engine loads it (hashes remembered per size and mtime); damaged artifacts show **Needs repair** and are never handed to an engine.                                                                                                                                                                                                                                                         |
| Installers                   | Web app: `npm run setup` (pinned uv, locked environments, Kokoro download). Windows app (branch `feat/desktop-release`): a bundled Python runtime with Kokoro; Chatterbox stays an optional install.                                                                                                                                                                                                                                                   |
| Tests and benchmarks         | Server tests at 100 % coverage (model integrity, download cancel and checksum failure, voice-file safety, path handling, security headers, LAN trust); real-inference tests (`npm run test:inference`); Playwright end-to-end with real Kokoro; `tests/perf/benchmark.py` (speed and memory); `ltts voice-ab` and `ltts voice-panel` for blind listening.                                                                                              |

### Text before the voice (measured 2026-10-21 on the installed espeak-ng pipeline)

The same words reach every engine after `speech_text` (typography, URLs, dashes, markup) and the
pronunciation dictionary. Kokoro then phonemises with espeak-ng. Phonemising the benchmark's hard passages
(no audio needed) shows where defects come from the text layer rather than the voice:

- **Homographs:** espeak-ng got `read`/`read`, `record`/`record`, `bass player`, `tear ran`, `the wound`
  and `the wind` right, but read **lead mine** as "leed", **took a bow** as "boh", **winds wind through**
  as "wind", **tear the page** as "teer", **caught a bass** as "base", **wound a bandage** as "woond",
  **Present the present** with noun stress on the verb, **the dove dove** as "duv duv", **Polish the Polish**
  both as "polish", **the does** as "duz" and **a minute amount** as "minnit": 11 of 22 wrong.
- **Money:** `£1,284.50` became "pound one thousand two hundred eighty four point five zero";
  `$1,500` "dollar one thousand five hundred".
- **Times:** `4:45 p.m.` keeps the colon, which the voice reads as a pause ("four, forty-five").
- **Phone and account numbers:** `020 7946 0321` became "zero twenty, seven thousand nine hundred forty
  six, zero three two one".
- **Years:** `1998` is read "nineteen hundred ninety eight".
- **Abbreviations:** `Mr.`, `Mrs.`, `Dr.`, `dept.`, `etc.`, `St. John's` expand correctly, but `Lt. Col.` is
  "L T call", `Rev.` "rev", `Mt.` "M T", `Rd.` "R D", `Ave.` "ah-vay", `Ms.` "M S", `approx.` "approx",
  `ref. no.` "ref no"; the full stop left after an expanded abbreviation makes a small pause.
- **Names:** `Siobhán` and `Aoife` are right; `Przemysław` and `Grzegorzewski` have their first letters
  spelled out ("P R zemislaw"), `Xiulan` is "zih-yoo-lan", `Ystradgynlais` "ustra-jin-lay".

These are engine-independent defects of the text layer, and the first ones to fix (section 7).

## 2. Human speech sources and speaker authorization

Full notes with every quote and URL: [voice-library/datasets-and-consent.md](voice-library/datasets-and-consent.md).
The seven rights the brief distinguishes are: (1) the recording's licence, (2) the dataset's licence, (3) the
right to train, (4) to redistribute the resulting voice asset, (5) to use generated speech commercially, (6) the
speaker's express authorization to reproduce their recognisable voice for third-party users, and (7) stated
restrictions. A permissive licence settles 1–5 at most; it never settles 6.

| Source                                                          | Recording / dataset licence                                            | Speaker's authorization (6)                                                                                                  | Restrictions (7)                                                                      | Verdict                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| LibriVox                                                        | Public-domain dedication ("people can do anything they like")          | **Not documented** for any reader; the AI wiki page says training is legal, nothing about voice identity                     | PD "in the USA, but not necessarily in other countries"; credit preferred             | Pending authorization                    |
| M-AILABS (mirror)                                               | BSD-style, "any commercial use"; LibriVox audio                        | Not documented; readers not named on any reachable page                                                                      | Ukrainian subset "machine learning purposes only" (the mirror's waiver can't lift it) | Pending authorization                    |
| LJSpeech (Linda Johnson)                                        | Public domain, "no restrictions on its use"                            | Not documented                                                                                                               | "use this dataset for good and not evil" (a request)                                  | Pending authorization                    |
| Hi-Fi TTS (10 LibriVox readers)                                 | CC BY 4.0                                                              | Not documented for the dataset; NVIDIA "sought the written consent of the speaker" before a TTS application                  | Attribution                                                                           | Pending authorization; the precedent     |
| LibriTTS / LibriTTS-R                                           | CC BY 4.0                                                              | Not documented                                                                                                               | Attribution                                                                           | Pending authorization                    |
| Mozilla Common Voice                                            | CC0                                                                    | **Contradicted in spirit**: downloaders agree "not to attempt to determine the identity of speakers"                         | No re-hosting; about 2.3 minutes per speaker                                          | **Unsuitable**                           |
| Jenny (Dioco), Irish English, ~30 h                             | Custom: "Commercial use is permitted", "No further restrictions apply" | Publisher level only; the speaker's own statement is not on the page                                                         | The voice must be called "Jenny (Dioco)" in interfaces that generate audio            | **Suitable at publisher level; confirm** |
| Thorsten-Voice (German), ~23–40 h                               | CC0, self-published                                                    | **Documented**: "intended for text-to-speech (TTS) model training", "commercial speech technology development"               | None from the licensor                                                                | Suitable (German only)                   |
| Bryce Beattie's own voice (Piper bryce)                         | Public domain, self-recorded                                           | **Documented**: "This is my voice", "any legal and ethical purpose"                                                          | About 750 samples                                                                     | Suitable, but tiny                       |
| Alan Pope (Mycroft)                                             | Model folder: "Copyright 2022 Mycroft AI / All Rights Reserved"        | Consent to be Mycroft's voice only                                                                                           | All rights reserved                                                                   | Unsuitable                               |
| CMU ARCTIC, VCTK                                                | Permissive (CMU 2003 terms; CC BY 4.0)                                 | Not documented; anonymous speaker IDs, not contactable                                                                       | Attribution, notices                                                                  | Pending, not approachable                |
| Blizzard 2013 Lessac, RyanSpeech, Expresso, EARS, Hi-Fi-CAPTAIN | Research-only or non-commercial                                        | Not documented                                                                                                               | NC / research                                                                         | Unsuitable                               |
| OHF-Voice / Nabu Casa crowdsourced (joe, kathleen…)             | CC0                                                                    | Not documented (no contributor terms on the page); Kathleen's Data Collective listing forbids identification                 | "please cite"                                                                         | Pending (ask Nabu Casa)                  |
| Kyutai Unmute voice donations (228 voices)                      | CC0                                                                    | Per-purpose consent boxes ("develop TTS models", "public open-source dataset") per search index; the terms are PDFs not read | Deletion requests update released datasets                                            | Pending verification                     |

**What this means.** No English source read today combines a permissive licence with a documented statement
by the speaker that their recognisable voice may be reproduced synthetically and shipped to other people's
applications. The two that come closest are Jenny (Dioco), where the publisher's licence plainly contemplates
exactly that use and only the speaker's own words are missing, and the Kyutai voice-donation set, whose
consent form apparently asks donors the right questions but whose terms could not be read. Everything from
LibriVox is legally usable as audio and unresolved as identity; NVIDIA's own practice (asking the reader in
writing before using a voice in a TTS product) is the model to follow. The documented route to a reader is a
private message on the LibriVox forum (the forum name is printed on each reader page) or an email to
LibriVox, which relays it; the ten Hi-Fi TTS readers (17–58 hours each of clean long-form reading) and Linda
Johnson are the obvious people to ask. Section 7 turns this into a proposal.

## 3. Engines compared for preset narrator voices

Full notes: [voice-library/engines-preset-voices.md](voice-library/engines-preset-voices.md); the cloning-side
comparison from 2026-10-21 is in [engine-comparison.md](engine-comparison.md) and is not repeated.

**The independent listening data puts Kokoro above every other permissively licensed engine with preset
voices.** On the Artificial Analysis arena (documented, 2026-10-21), Kokoro-82M v1.0 has Elo 1065 (rank 57 of
98), above Chatterbox (1024), Zonos (1000), OpenVoice v2 (956), XTTS v2 (916) and StyleTTS 2 (892). The models
above it are non-commercial (Fish Drama 3, Breeze TTS 2, Voxtral TTS) or GPU-class with undocumented voice
provenance (Ming-3.0-tts-0.5B, MIT, Elo 1190, tested only on data-centre GPUs). Pocket TTS, Qwen3-TTS open
weights, Supertonic, KittenTTS, MeloTTS, Parler, Orpheus, Dia2 and CosyVoice 3 are not on that leaderboard;
Kyutai's own test rates Pocket TTS below Chatterbox Turbo and does not rate Kokoro.

| Engine                                                             | Licences (code / weights)                     | Preset voices and their provenance                                                                                                                                                                                  | CPU                                     | Verdict for a narrator library                                             |
| ------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Kokoro-82M (installed)                                             | Apache-2.0 / Apache-2.0                       | 54; hexgrad: trained on permissive audio including "synthetic audio generated by closed TTS models"; only af_sky's origin is stated (3 minutes of OpenAI's Sky); 5 names match OpenAI voices, 4 match Gemini voices | Real time and better                    | Stays the reader engine; voice provenance is undocumented (legal audit R7) |
| Chatterbox Turbo (installed), Nano, V3                             | MIT / MIT                                     | No named presets; the built-in voice comes from "freely available data on the internet"                                                                                                                             | Nano claims 3× real time on 8 cores     | Stays the cloning engine; the right engine for authorized human references |
| Qwen3-TTS CustomVoice                                              | Apache-2.0 / Apache-2.0                       | 9 (2 English: Ryan, Aiden); provenance not documented                                                                                                                                                               | 0.6B int8 about a third of real time    | Not rated above Kokoro; GPU mode at best                                   |
| Kyutai Pocket TTS                                                  | MIT / CC-BY-4.0, "no cloning without consent" | 26; the best-documented provenance of any engine (VCTK, LibriVox via CC0 Voice-Zero, CC0 donations, a CC-BY actor; two from NC datasets)                                                                            | About 6× real time (claimed)            | No evidence it beats Kokoro; worth a listen later                          |
| Supertonic 3                                                       | MIT / OpenRAIL-M with use restrictions        | 10; provenance not documented                                                                                                                                                                                       | 4× real time (independent)              | Fast, but the RAIL terms must flow to users; repository archived           |
| KittenTTS 2                                                        | Apache-2.0 / community licence (USD 1M cap)   | 47; provenance not documented                                                                                                                                                                                       | Claimed real time                       | Licence cap                                                                |
| Ming-3.0-tts-0.5B                                                  | MIT / MIT                                     | "100+ Chinese and five English"; provenance not documented                                                                                                                                                          | None stated; data-centre GPUs           | The only permissive engine rated above Kokoro; a GPU experiment            |
| NVIDIA Magpie 357M                                                 | NVIDIA Open Model License                     | 5, one a LibriVox reader (John Van Stan), four "proprietary"                                                                                                                                                        | Roughly 3× slower than real time (port) | Linux-only toolkit                                                         |
| MeloTTS, Parler, Orpheus, OuteTTS, Dia2, CosyVoice 3, NeuTTS, XTTS | various                                       | Dormant, no presets, CPU too slow, or non-commercial                                                                                                                                                                |                                         | Excluded                                                                   |

**The one engine-level improvement with evidence behind it is the phonemiser, not a new engine.** hexgrad
(documented, kokoro issue 103): "As of v1.0, the Kokoro model is trained on the Misaki G2P engine" and
"Crossing phonemizers is not recommended." TTSNative's `kokoro-onnx` phonemises with espeak-ng instead, as its
README itself discourages. Measured here (section 5): espeak's output differs from misaki's on 60 of 61
benchmark sentences, mostly in exactly the way the issue describes (diphthongs split into two symbols, length
marks and flaps the model was not trained with), and misaki's part-of-speech tagging reads several homographs
correctly where espeak does not (tear, wound, present, live). misaki is Apache-2.0, but its English extra
depends on spaCy, a small spaCy model and, in version 0.9.4, torch and transformers for an optional neural
fallback that an espeak fallback replaces.

## 4. Piper voices

Full catalogue (38 English voices and the German reference case, with sizes and SHA-256 from the Hugging Face
pointers): [voice-library/piper-voices.md](voice-library/piper-voices.md).

- **Authorization.** Only `en_US-bryce-medium` (the speaker's own 750 samples) and `de_DE-thorsten-*` reach
  verdict A. `en_GB-jenny_dioco-medium` is B with an attribution duty. The LibriVox-derived voices (john,
  norman, kristin, cori, ljspeech, libritts) are B. `lessac` (Blizzard 2013, research licence), `ryan`
  (CC BY-NC-ND per its paper), `hfc_*` (CC BY-NC-SA), `l2arctic`, `semaine`, `amy`, `danny`, `kusal`, `alan`
  (all-rights-reserved model folder), `mike` and `reza_ibrahim` are C.
- **Lineage.** Almost every medium voice, Jenny and Thorsten included, was fine-tuned from `en_US-lessac-medium`,
  and every low voice from `en_US-ryan-low`; whether weights inherit those research and non-commercial terms is
  undetermined, and Piper's maintainer declines to say.
- **Quality.** No controlled Piper-versus-Kokoro test exists. The informal evidence (a 20-listener panel at
  MOS 3.8–4.0 for Piper against 4.3–4.5 for Kokoro, production blogs noting "occasional weird prosody" and
  "less emotional inflection") points one way: Piper's VITS voices are below Kokoro, not above it.
- **Engine.** The current Piper is GPL-3.0 (it embeds espeak-ng); the MIT-era code and the voice configs fully
  document the ONNX contract, so a voice could be run from onnxruntime plus an espeak phonemiser without GPL
  Piper code. Piper does no text normalisation at all.

**Verdict.** Piper voices were not downloaded or auditioned. The mission is fewer robotic voices, and every
piece of evidence says these would sound more robotic than the voices TTSNative already has, while the two
with clean speaker authorization are a 750-sample voice and a German one. Reopen only if a listening test on
a fine-tuned Piper voice of a consenting narrator ever beats Kokoro, which nothing read today suggests.

## 5. Benchmark

`tests/perf/narration_corpus.json` holds 13 passages written for this benchmark on 2026-10-21, so no voice
was built from them and no reference recording contains them: long-form fantasy, literary fiction, a
three-character dialogue, an emotional passage, complex sentences, unusual names, questions and
exclamations, numbers and dates, abbreviations, homographs, a quiet descriptive passage, paragraph and
chapter transitions, and a 900-word chapter for fatigue listening.

`tests/perf/narration_benchmark.py` reads them with any set of voices through the real path (pasted
document → sentences → the synthesis service with its pauses and polish) and records, per voice, the load
time, first and median sentence latency, real-time factor, peak memory of the server and worker, GPU memory,
loudness, pause share, pace, clipping and whether the same text comes out the same twice. It then writes a
blind panel (`ltts voice-panel`) of the shorter passages and an anonymised long-form folder.

### Measurements (2026-10-21, this computer: 32-thread Zen 3, 64 GB, RTX 3080 10 GB)

Measured while other sessions' servers and a full test suite were running, so the speeds are pessimistic
against the idle figures in [performance.md](../guides/performance.md) (Kokoro real-time factor 0.21 there).
"RTF" is generation seconds per second of audio over the whole 17 minutes a voice read; "first sentence" is
the first sentence after the model loaded; peak memory is the benchmark process with every service and
the engine's worker, so it is above the server's usual footprint.

| Voice                              | Engine, device   | Load   | First sentence | Median sentence | RTF  | Peak RSS           | Same text twice                                       |
| ---------------------------------- | ---------------- | ------ | -------------- | --------------- | ---- | ------------------ | ----------------------------------------------------- |
| Kokoro af_heart (default, grade A) | Kokoro, CPU      | 1.5 s  | 1.9 s          | 1.09 s          | 0.31 | 968 MB             | Length differs by a few ms; samples differ            |
| Kokoro af_bella (A-)               | Kokoro, CPU      | loaded | 2.1 s          | 0.85 s          | 0.26 | 1.3 GB             | same                                                  |
| Kokoro af_nicole (B-)              | Kokoro, CPU      | loaded | 2.7 s          | 1.47 s          | 0.30 | 1.5 GB             | same                                                  |
| Kokoro bf_emma (B-)                | Kokoro, CPU      | loaded | 4.0 s          | 1.45 s          | 0.39 | 1.5 GB             | same                                                  |
| Kokoro bm_george (C)               | Kokoro, CPU      | loaded | 4.1 s          | 1.18 s          | 0.31 | 1.5 GB             | same                                                  |
| Kokoro am_michael (C+)             | Kokoro, CPU      | loaded | 3.9 s          | 1.26 s          | 0.34 | 1.5 GB             | same                                                  |
| Kokoro am_fenrir (C+)              | Kokoro, CPU      | loaded | 1.9 s          | 0.94 s          | 0.30 | 1.5 GB             | Same length; samples differ (max 0.87 full scale)     |
| Chatterbox default                 | Chatterbox, CUDA | 36 s   | 4.8 s          | 2.61 s          | 0.81 | 2.6 GB (+4 GB GPU) | Same length; samples differ by at most 0.005 (seeded) |
| Owner's studio voice (local only)  | Chatterbox, CUDA | loaded | 5.9 s          | 2.49 s          | 0.74 | 2.7 GB (+4 GB GPU) | Same length; samples differ by at most 0.005 (seeded) |

What the numbers say:

- **Kokoro keeps up with reading on this CPU with three to four times to spare**, even under load, and
  every passage rendered without an error. Nicole and Emma are the slowest (longer, more deliberate
  readings), Bella the fastest.
- **Kokoro's output is not bit-identical from one run to the next.** Its vocoder adds a random noise
  source for unvoiced sound, so the same sentence differs by up to 0.05–0.08 of full scale between runs
  (three direct runs of one sentence, same length), and kokoro-onnx places its pauses from the audio it
  detects, so a whole passage can differ in length by a few milliseconds. This is inaudible, and the app
  caches every sentence, so playback, exports and highlighting never see two versions of one sentence.
- **Chatterbox Turbo on the GPU generated at 0.74–0.81 of real time under load** (0.58 when idle, per
  performance.md): fast enough for continuous reading on an RTX 3080, with a 36-second first load and
  2.5-second sentences, and about 4 GB of GPU memory. Every passage rendered; the seeded, retried
  sentences came out the same length both times with sample differences under 0.005. On a CPU it
  would be several times slower than real time, which is why any voice built on it stays an
  optional, GPU-recommended install, never the default.
- **Peak memory** rose from 968 MB with one voice to 1.5 GB with the clips of seven voices held by the
  benchmark process; the server itself was measured at about 700 MB before.

Per-clip loudness, pause share and pace for every voice and passage are in `.tools/bench/metrics.csv`.

### What the text layer still gets wrong (heard in the clips, independent of voice)

The homograph, number and abbreviation passages were rendered after the English reading rules of
section 7; the remaining defects belong to the phonemiser: "lead mine", "took a bow", "winds wind",
"caught a bass", "the dove dove", "Polish the Polish", "the does", "a minute amount", and the Polish and
Welsh names, which espeak-ng spells out or guesses. misaki fixes four of these (section 5's phoneme
comparison) and would need a dictionary entry or the pronunciation dictionary for the rest.

### Phonemiser comparison (misaki against espeak-ng, Kokoro af_heart)

61 benchmark sentences were phonemised both ways in an isolated environment and synthesised from the
phonemes with the same voice and seed-free path (`.tools/g2p-ab`). Phoneme strings differ for 60 of 61;
the only sentence that agrees is a short exclamation. The differences are systematic: misaki writes
diphthongs as single tokens (`A`, `I`, `W`, `Y`, `O`), no length marks, `T` for the flapped t and `ʧ`/`ʤ`
for affricates, exactly the token set the model's vocabulary holds (all six diphthong tokens are in the
ONNX vocabulary and misaki produced no symbol outside it), while espeak writes `eɪ aɪ aʊ ɔɪ oʊ`, `iː ɑː
ɔː`, `ɾ` and `tʃ dʒ`. On the homographs misaki reads "tear the page", "wound a bandage", "Present the
present" and "plays live" correctly where espeak does not, and gets "bass player" wrong where espeak gets
it right; both get "Polish", "does" and "minute" wrong. Which side sounds better is for the blind pairs
(section 6); the phoneme evidence alone says the app is feeding Kokoro a transcription it was not trained
on.

## 6. Blind listening (for the owner; not yet done)

No listening result is claimed in this document. Three packs are ready, all local, none shared:

1. **Voices panel** `.tools/bench/panel/listen.html`: nine passages read by af_heart, bf_emma, am_michael,
   the Chatterbox default voice and the owner's own studio voice, numbered in a new random order per
   passage; rate each clip for naturalness and likeness, tick garbled words, pick the best; then
   `ltts voice-panel score .tools/bench/panel answers.json`.
2. **Long-form fatigue** `.tools/bench/longform/listen.html`: the 900-word chapter by every voice, anonymised;
   notes per voice; `key.json` unblinds.
3. **Phonemiser pairs** `.tools/g2p-ab/listen/listen.html`: 31 pairs (homographs, names, narration, dialogue)
   of af_heart with espeak against misaki phonemes, X/Y shuffled; then
   `ltts voice-ab score .tools/g2p-ab/listen answers.json` (A is espeak, B is misaki).

Decision rules proposed in advance: a phonemiser change is adopted only if misaki is preferred in at least
20 of 31 pairs (p ≈ 0.07 against chance at 31 pairs; 21 gives p ≈ 0.04); a candidate voice joins the
library only if its naturalness rating beats af_heart's on the paired sign test at p < 0.05 and no
passage is marked garbled more often than the baseline.

## 7. What to change, and what not to

### Done on this branch (no new voices, no new engines, no downloads)

1. **English voices read money, times, phone numbers, years, chapter numerals and abbreviations as a
   narrator does** (`synthesis/english.py`, applied to English voices of every engine after the pronunciation
   dictionary). The defects it fixes were measured in the text layer (section 1), so they were defects of
   every voice at once. Each rule is a bounded regular expression with a linearity test.
2. **Every voice says where it comes from.** Voice cards and the voice list API carry an attribution naming
   the model and licence and saying the voice is synthetic, not a recording (Kokoro-82M Apache-2.0; Chatterbox
   Turbo MIT and watermarked; custom voices conditioned on a consented recording; blends).
3. **A repeatable benchmark** (section 5) and the blind listening packs (section 6).

### Not done, and why

- **No voice was added.** No English source read today documents the speaker's authorization for synthetic
  reproduction and distribution (section 2); the preset-voice engines with permissive weights are rated
  below Kokoro or have undocumented voice provenance (section 3); Piper's voices sit below Kokoro in every
  informal comparison and inherit research-licensed checkpoints (section 4). Adding any of them would mean
  lowering either the authorization standard or the quality bar. Nothing was downloaded.
- **No engine was added.** The only permissive engine with independent evidence of beating Kokoro
  (Ming-3.0-tts-0.5B) is a data-centre GPU model with undocumented voices; a hands-on test is a separate,
  approved experiment, not a library change.

### Proposed, for the owner's decision

**A. Phonemise Kokoro with misaki, the G2P it was trained on.** Evidence: hexgrad's statement, 60 of 61
benchmark sentences phonemised differently by espeak, misaki's correct homographs (section 5), and the 31
blind pairs in `.tools/g2p-ab/listen` for the owner's ears. Cost: misaki 0.9.4 (Apache-2.0) plus spaCy with
its small English model (a 12.8 MB wheel from spaCy's GitHub releases, to be pinned by hash) and num2words.
misaki 0.9.4 imports torch and transformers at module level for an optional neural fallback that an espeak
fallback replaces; the app must not take torch into the server environment, so adoption means either a misaki
release that imports them lazily or a trimmed, attributed copy of its English G2P (Apache-2.0 allows it).
Non-English voices keep espeak. The Kokoro engine revision changes, so cached audio is generated again once.
Adopt only if the owner prefers the misaki side of the blind pairs.

**B. A narrator programme instead of a scraped library (Strategy B: authorized references for Chatterbox
Turbo).** The engine, the studio session, the `.ttsvoice` package and the download-and-verify path all exist.
What is missing is people, and section 2 says where to find them: the ten Hi-Fi TTS readers (17–58 hours of
clean long-form LibriVox reading each; contact by forum private message or through LibriVox), Linda Johnson,
Dioco for Jenny, and the Kyutai voice donors once the donation terms have been read in full.

- Ask each narrator in writing for the eight elements the datasets note lists: identity, permission to
  train or condition a model on their voice, permission to redistribute the resulting voice asset inside
  TTSNative to third-party users, commercial and non-commercial generated speech, how they wish to be
  credited, purpose limits, revocability, and country of residence. Keep the signed statement with the
  voice's provenance record.
- Record or import at least ten minutes of clean speech per narrator through the studio session (its 48
  passages are already a recording script), build the voice locally, and ship it as a `.ttsvoice` pack
  listed in a voice-pack manifest: pinned URL on a trusted host, size, SHA-256, licence and credit, installed
  through the model store (atomic, resumable, cancellable, removable, offline afterwards), requiring the
  optional Chatterbox engine and saying so, with a GPU recommended.
- Keep six good voices as the target (US and UK narrators, warm, deep, expressive, neutral), each chosen by
  a blind panel on the benchmark corpus against the Kokoro baseline, and never the owner's own voice.
- Revocation: a narrator who withdraws is removed from the manifest; installed copies carry the credit and
  the date of authorization.

**C. Later experiments (each its own approval):** Ming-3.0-tts-0.5B and Qwen3-TTS CustomVoice as an
optional GPU "high quality" mode, judged on the same corpus and panel; Chatterbox Nano for CPU cloning.

**D. Keep saying no to:** Common Voice (identity clause), LibriVox-derived voices without the reader's written
authorization, Piper voices, Kokoro's unnamed voice origins presented as anything but what hexgrad states.

## 8. Security review

- **Trust boundaries kept.** No download, dependency or security setting of the app changed. The two code
  changes are pure Python string rewriting (bounded regular expressions, with a test that a hostile input
  stays linear) and new metadata strings; the model store, host allow-list, checksum and `require_intact`
  paths are untouched and still cover every file an engine loads.
- **Research was reading only.** Three research helpers read pages through fetch tools under the same rules:
  no downloads, installs or commands from any page; every fact labelled; pages that addressed AI agents listed
  (section 9) and ignored.
- **The evaluation environment** (`.tools/misaki-env`, git-ignored, outside the app) holds spaCy 3.8.16, the
  `en_core_web_sm` 3.8.0 wheel from spaCy's GitHub releases, misaki 0.9.4 installed without its dependencies,
  num2words, kokoro-onnx 0.6.1 and onnxruntime, all as wheels; torch and transformers were replaced by empty
  stub modules so misaki's unused neural fallback is never built. Two lessons for any integration: misaki's
  `phonemizer-fork` and kokoro-onnx's `phonemizer` share one import name and must never share an environment
  (the fork mis-split "11,000" in the scratch environment; the app's phonemizer reads it correctly), and a
  spaCy model is a Python package that runs code on import, so it needs the same pinning and review as any
  dependency.
- **Benchmark scripts** run with the real app services on a throw-away data directory and read only the
  installed, verified models; nothing in `.tools` is part of the app.
- **Remaining risks, unchanged by this work:** Kokoro's undocumented voice origins (legal audit R7, now at
  least stated on every card); Chatterbox's `conds.pt` pickle (read with `weights_only=True`); the owner's own
  voice data, which stays in `data/` and is excluded from anything shipped.

## 9. Pages that addressed AI agents (ignored)

None of the pages read for sections 2–4 contained instructions to AI agents. Noted and not acted on: a
developer command block for Kyutai staff on the kyutai/tts-voices page; an `AGENTS.md` listed in espeak-ng's
repository (not opened); a research-portal footer reserving rights against AI training. The earlier
cloning comparison ([engine-comparison.md](engine-comparison.md)) lists the pages from that day.
