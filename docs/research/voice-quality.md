# Cloned voice quality: what helps Chatterbox Turbo

> **In short:** Turbo takes a voice's rhythm and inflection almost entirely from a 15-second prompt
> (its emotion conditioning is switched off), so one prompt made every sentence sound alike. TTSNative
> now keeps a prompt per kind of sentence (questions, lively lines, dialogue, narration), fills each
> prompt with 15 s of speech, seeds and retries implausible sentences, and levels loudness. A LoRA
> fine-tune of T3 on the session, measured below, is now an optional step the owner keeps only after
> comparing.

Research date: 2026-10-20. Pages were only read; nothing was downloaded or run, except the
fine-tuning measurements, which used the already-installed engine. Each finding is marked
**verified** (read on the cited page), **measured** (run here) or **inference** (our reasoning).

## What limits Turbo

- **Verified** (resemble-ai/chatterbox, ~27k stars, MIT, `tts_turbo.py`):
  - Turbo turns off emotion conditioning and the perceiver resampler, and ignores `cfg_weight`,
    `exaggeration` and `min_p`.
  - The reference must be over 5 s and is loudness-normalised to -27 LUFS.
  - S3Gen uses its first 10 s and T3's prompt tokens its first 15 s; the voice-encoder embedding uses
    the whole clip.
  - `punc_norm` turns "…" and ":" into commas and dashes into "-".
- **Inference:** inflection therefore comes from the T3 prompt's speech tokens. Averaging the speaker
  embedding over a session improves _who_ it sounds like, not _how_ it speaks.

## What projects do, and what TTSNative adopted

| Technique                                                                                         | Seen in (verified)                                                                                                                                                                    | In TTSNative                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Several candidates per chunk, validated by speech recognition (Whisper) and text similarity       | Chatterbox-TTS-Extended (582★, MIT), tts-audiobook-tool (227★, MIT)                                                                                                                   | Partly: a length-plausibility check and up to two seeded retries  |
| "Excessive duration" check against the expected length                                            | tts-audiobook-tool                                                                                                                                                                    | Yes (`cloned_speech.plausibility`)                                |
| Fixed seeds for repeatable output                                                                 | Chatterbox-TTS-Server (1.5k★, MIT)                                                                                                                                                    | Yes: seeded from the sentence's text                              |
| Trim edges, shorten long internal silences (≥700 ms to 300 ms), normalise loudness                | Chatterbox-TTS-Server, Chatterbox-TTS-Extended (loudnorm), Chatterbox-Pro                                                                                                             | Yes (`cloned_speech.polish`, -23 dBFS like the built-in voices)   |
| Lower temperature and top-k for steadier prosody (0.7 / 600 scored best in a published fine-tune) | CoRal røst-v3 Turbo model card                                                                                                                                                        | Yes, for the **Steady** delivery                                  |
| `generate()` inside `torch.inference_mode()` (memory grew per call otherwise)                     | tts-audiobook-tool                                                                                                                                                                    | Yes                                                               |
| Group very short sentences; chunks of ~120–300 characters                                         | Chatterbox-TTS-Server, Chatterbox-TTS-Extended                                                                                                                                        | Not yet: sentences are the unit of highlighting and caching       |
| Reference audio: 10–30 s, clean, natural; test several clips                                      | chatterbox-tts-api (AGPL, ideas only), tts-audiobook-tool                                                                                                                             | Yes: style prompts join takes to a full 15 s, pauses shortened    |
| Different references per sentence type                                                            | None found (closest: per-segment voice switching in TTS-Audio-Suite)                                                                                                                  | **Yes, new:** a style prompt per kind of sentence                 |
| Paralinguistic tags                                                                               | Resemble confirms 9 sound tags ([laugh] [chuckle] [sigh] [gasp] [cough] [clear throat] [sniff] [groan] [shush]); users call them hit or miss; emotion tags reported to have no effect | Offered as an experimental "sound before it" for chosen sentences |
| Double quotes can come out as a breathy sound                                                     | Reported for the MLX port                                                                                                                                                             | Quotes are dropped from the text Chatterbox reads                 |

## Measured on a real studio voice

We built the styles from a copy of the owner's 48-take session on an RTX 3080 and generated A/B
sentences, one seed each, before and after. Pitch was measured with pYIN.

| Sentence    | Pitch range before | After  |
| ----------- | ------------------ | ------ |
| Question    | 2.8 st             | 3.8 st |
| Exclamation | 3.4 st             | 5.3 st |
| Dialogue    | 4.0 st             | 4.3 st |
| Narration   | 2.8 st             | 3.4 st |

All clips came out at the same loudness (-23.3 to -23.6 dBFS). A first version picked calm
conversation takes for dialogue, which came out flatter (4.0 → 1.9 st). Dialogue now prefers the
animated quoted lines, and questions and exclamations prefer the passages that actually contain them.

These are single samples, so they show a direction rather than a measured gain. Listening is the
real test.

## Repeatable A/B comparisons

Every quality change should be judged by ear, blind, on the same sentences. `ltts voice-ab` makes that
repeatable:

```bash
node scripts/uv-run.mjs run --frozen --project apps/server ltts voice-ab compare custom:<before> custom:<after> --reference data/voices/<id>/reference.wav
```

- Both voices read the same sentences (a built-in set covering narration, questions, an exclamation,
  quoted dialogue, numbers, names, a long sentence and a calm aside; or `--sentences file.txt`) through
  the normal synthesis path, so styles, pronunciations and loudness levelling apply as in the app.
- Each pair is written as **X** and **Y** in an order shuffled by `--seed`; `key.json` records which is
  which, and the same seed gives the same order.
- `metrics.csv` has plain measurements per clip: length, syllables per second, speech loudness, pause
  share, clipping and, with `--reference` and the cloning engine installed, how close the speaker
  sounds to the reference (the cosine of both of Chatterbox's speaker embeddings, averaged).
- `listen.html` is a local page with the pairs and a choice per pair; it loads nothing from anywhere.
  Save the answers, then `ltts voice-ab score <folder> answers.json` unblinds them and reports how often
  each voice was preferred, with its mean similarity.

Similarity is a sanity check, not a verdict: two voices within about 0.02 of each other are a matter
for the listening test.

## What the session is, and isn't

A studio session doesn't train anything. Chatterbox Turbo speaks from a short reference (S3Gen uses
about the first 10 s, T3 about 15 s of prompt tokens) plus, in TTSNative, short style prompts. The
session's job is to choose those well: it averages the speaker's identity over all takes, ranks the
takes as prompts and builds speaking styles from passages that contain questions, exclamations and
dialogue. More takes give more to choose from and a steadier identity, not a "trained" model; the app
says so wherever the session is described. Fine-tuning (below) is a separate, optional step after the
session, and it is the only thing in TTSNative that trains anything.

## Fine-tuning T3 on the session (measured)

The toolkit was read, not run.

- **Verified**
  ([gokhaneraslan/chatterbox-finetuning](https://github.com/gokhaneraslan/chatterbox-finetuning),
  Apache-2.0):
  - It trains T3 only, in full or LoRA mode. It recommends LoRA for Turbo because full fine-tunes can
    hallucinate.
  - It asks for 30+ minutes of 3–10 s segments.
  - It runs on HF `Trainer` with `peft`, `accelerate` and `tensorboard`.
  - It extends the vocabulary and trains the text embeddings (it targets new languages).
  - Its Turbo training framing differs from how Turbo generates:
    - it adds start/stop text tokens;
    - it feeds no start-of-speech token;
    - it masks the first 3 s of every target, because its prompt is cut from the target itself.
- **Measured** (a copy of the owner's real session, RTX 3080 10 GB):
  - **Data.** The session kept 48 takes, 7.6 minutes; six (the last of each passage group) were
    held out.
  - **Trainer.** TTSNative's own, using only the worker's locked packages. It is a rank-16 LoRA on
    every block's attention and MLP projections, framed exactly like `inference_turbo`. Each take
    is prompted by style-like prompts built from other takes.

| Measure                        | Result                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Peak VRAM                      | 2.9 GiB with gradient checkpointing (5.0 GiB without); the model alone is 2.6 GiB     |
| Time                           | About 13 s an epoch; best epoch 4; about 75 s of training, about 2 min with loading   |
| Held-out loss per speech token | 4.10 → 3.89 (−5 %, perplexity −19 %); three runs agreed (3.89–3.90)                   |
| Adapter                        | 12.6 MB (bf16 safetensors)                                                            |
| Synthesis                      | Merged into the weights: same speed as before; base audio bit-identical after restore |

A/B on 12 new sentences × 2 seeds, same voice, style prompts and seed:

| Measure                | Before | After | Owner's takes |
| ---------------------- | ------ | ----- | ------------- |
| Pitch range (st)       | 2.48   | 3.21  | about 3.4     |
| Speaking rate (syll/s) | 4.85   | 4.66  | 4.04          |
| Speaker similarity     | 0.913  | 0.916 | —             |

- **By kind of sentence:** pitch range went up for narration, questions and dialogue, and down
  slightly for lively lines.
- **Paired comparisons:** of the 24, pitch was closer to the owner's takes in 14 and rate in 18.
- **Failures:** no clip came out implausibly long or short.
- **Inference:** the gain is real but modest, and single samples are noisy. So TTSNative offers the
  fine-tune as an experimental step and keeps it only when the owner prefers it by ear (ADR-16).
- **Splitting takes into sentences:** gave no further gain over whole takes.

**Measured: the owner's blind listening test** (2026-10-21, the same 24 pairs, order shuffled):

| Kind      | Fine-tuned | Current | Same   |
| --------- | ---------- | ------- | ------ |
| Dialogue  | 3          | 2       | 1      |
| Lively    | 3          | 2       | 1      |
| Narration | 0          | 1       | 5      |
| Question  | 1          | 2       | 3      |
| **All**   | **7**      | **7**   | **10** |

- **Counted as preferences:** a tie, 7 to 7, so these pairs don't show an audible gain on 7.6 minutes
  of data.
- **Narration:** almost always sounded the same.
- **The owner's overall impression:** the fine-tune sounded better, so it ships as an experimental,
  opt-in step.
- **What could make the gain clear:** more training speech, for example longer sessions or imported
  recordings with local transcripts. That work is on a follow-up branch.

## Next steps

1. **Speech-recognition validation (M).** Use a small local Whisper model to re-generate sentences
   that drop or repeat words. It needs a model download, so it should be opt-in.
2. **Short-sentence grouping (M).** Synthesise very short sentences together with a neighbour, then
   split them by timing. This needs care to keep sentence highlighting exact.
3. **More data for fine-tuning (S).** Imported recordings can't be fine-tuned on yet because they
   have no text. A local transcript (the same Whisper model) would let longer sessions train on
   everything they recorded.
