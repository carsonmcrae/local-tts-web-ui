# Studio voice audit: what the recordings actually do

Checked on 2026-10-21 against the code on `feat/studio-voice-plus` and the owner's real session (48
takes), with fine-tuning reviewed on `feat/voice-tune` (not merged). Measurements are from this
computer (RTX 3080). The owner's recordings never left it, and nothing here was trained. The three
adapters measured were made earlier by the fine-tuning experiment.

## The short answer

Under today's design, a studio voice uses the audio of about 14 takes and two averaged numbers from
the rest. Recording all 48 passages measured no better than an early voice built from 13 takes, or
than one good take from the same session. The time that earns its place is the session's careful
setup: the same microphone, a quiet room and clean takes. More passages don't add to it. The blind
listening panel agreed (see [What the owner heard](#what-the-owner-heard-blind-panel-2026-10-21)).

- **What a session is.** The owner's 48 takes are 7.6 minutes of audio (about 5.6 minutes of
  speech), not 30. The app's "30–45 minutes" is the time a session takes, including setup and
  retakes.
- **No model learns from the recordings in this branch.** Chatterbox Turbo is zero-shot: everything a
  voice is comes from what it is given at synthesis time (below).

## How a studio voice is built and used (traced)

The build job (`apps/server/src/ltts/voices/studio.py`) and the worker
(`apps/chatterbox-worker/src/ltts_chatterbox_worker/studio.py`):

1. **Measure every usable take.** Each take gives two speaker embeddings: Chatterbox's voice encoder
   (256 numbers) and S3Gen's x-vector (192 numbers), plus its pitch spread.
2. **Average the speaker** over the takes that sound like the session (`session_identity`, cosine
   at least 0.75 to the mean; all 42 did).
3. **Rank takes as prompts** (`rank_prompts`): speech length, signal-to-noise, pitch movement,
   typicality, pauses and brightness. The best five are built and auditioned on two sentences with
   the same seed, and the one closest to the averaged speaker is offered first.
4. **Build speaking styles** (`voices/styles.py`). For narration, questions, lively lines, dialogue
   and calm lines, the best three takes of the matching passage groups are joined into one 15 s T3
   prompt.

Chatterbox Turbo takes these inputs (checked in the installed `chatterbox/tts_turbo.py`):

| Input                      | Where it comes from in a studio voice                         | What it shapes             |
| -------------------------- | ------------------------------------------------------------- | -------------------------- |
| T3 speaker embedding (256) | The averaged voice-encoder embedding (all takes)              | One conditioning token     |
| T3 prompt tokens (≤ 15 s)  | The sentence's style prompt (≤ 3 takes), else the chosen take | Rhythm, inflection, accent |
| S3Gen prompt (≤ 10 s)      | The first 10 s of **one** take: the chosen candidate          | Timbre (in-context)        |
| S3Gen x-vector (192)       | The averaged x-vector direction (all takes)                   | Timbre                     |

For every sentence:

- **Style:** chosen from its final punctuation or quotes (`engines/cloned_speech.sentence_style`),
  or from the planner (`documents/styling.py`, `documents/delivery.py`).
- **Seed:** taken from the sentence's text, so the same sentence always sounds the same.
- **Retries:** an implausibly short or long clip is generated again, up to three times.
- **Polish:** silent edges are trimmed, long pauses shortened and loudness levelled.

## The seven questions

1. **How many of the 48 recordings influence synthesised speech?**
   - In the complete voice measured here (42 takes, 6 held out), the audio of 14 distinct takes is
     used:
     - take 44 gives the timbre;
     - takes 1, 2 and 4 give narration;
     - takes 26, 27 and 29 give questions;
     - takes 28, 25 and 9 give lively lines;
     - takes 9, 11 and 22 give dialogue;
     - takes 44, 41 and 46 give calm lines.
   - The other 28 only move two averaged vectors.
   - The owner's saved voice was built before styles existed, so it uses one take's audio (take 1)
     plus the averages.
2. **Which are selected, and why?** By the ranking above and the style-to-passage table in
   `styles.STYLE_SOURCES`. The numbers, names and lists passages (eight takes) don't teach any
   style.
3. **Does one sentence ever combine several recordings?** Yes, in two limited ways:
   - its style prompt is joined from up to three takes;
   - its speaker embeddings are averages over all takes.

   The timbre prompt is always one take. Chatterbox Turbo has no multi-reference conditioning:
   there is one prompt per stage, and joining takes into it is the only way to combine them.

4. **Has the system learnt a reusable representation of the speaker?** Only the two averaged
   embeddings. They are a summary, not learning: no weights change, and they settle quickly (next
   question).
5. **Does completing 48 passages improve the voice compared with the foundation?**
   - Not measurably by any metric we have (table below).
   - Averaging 8 random takes is already within 0.994 of the 42-take average (the 5th percentile is
     0.992), and 12 takes within 0.997.
6. **Are some passages providing no value?** With today's design:
   - beyond about 10 takes for the average, the 14 prompt takes are all that matter;
   - the eight numbers, names and lists passages never teach a style.

   So roughly 28 of 42 takes add nothing measurable.

7. **Could 5–10 minutes of chosen recordings do as well?** Yes, and less would do:
   - The early voice (B: 13 takes, 113 s of speech) measured the same as the complete one.
   - Everything the design uses fits in about 16 well-chosen passages: about 2.5 minutes of speech,
     or 10–15 minutes of session time.

## The comparison

All voices read the same ten items, none of which is in the recording script:

- narration, dialogue, sad, excited, a question, unusual words, names, style changes, a calm line;
- a 47 s continuous passage.

They used the app's own synthesis path, with the same seeds and the "natural" delivery. The six
held-out takes (8, 16, 24, 32, 40 and 48) were left out of every build and used as the reference for
the owner's voice.

| Voice                                              | Similarity    | Lowest        | Pitch range (st) | Pace (syll/s) |
| -------------------------------------------------- | ------------- | ------------- | ---------------- | ------------- |
| A: quick voice, 26 s recorded on another day       | 0.855         | 0.813         | 3.04             | 5.49          |
| A2: one 15 s take from the session                 | 0.920         | 0.880         | 2.70             | 5.71          |
| B: early voice, 13 takes (113 s)                   | 0.923         | 0.890         | 2.82             | 5.34          |
| C: complete voice, 42 takes, styles                | 0.922         | 0.891         | 2.83             | 5.28          |
| D: C + fine-tune adapter (worker trainer, epoch 4) | 0.920         | 0.857         | 3.21             | 5.51          |
| D1 / D3: C + the spike's adapters                  | 0.926 / 0.930 | 0.877 / 0.903 | 3.08 / 3.01      | 5.20 / 5.24   |
| E: C with a timbre prompt joined from three takes  | 0.914         | 0.861         | 2.75             | 5.32          |
| The owner (held-out takes)                         | —             | —             | 3.51             | 5.43          |

How to read the table:

- **Similarity** is the mean cosine to the held-out takes, averaging both Chatterbox encoders.
- **Rows A to E** cover 20 clips each (two seeds); **D1 and D3** cover 10 (one seed).
- **Pitch range** is the standard deviation of voiced pitch, the measure used before.
- **Pace** is estimated syllables per second of speech.
- **The owner's pace** is measured on the recording script with the same estimate.

What the measurements say, and don't:

- **A → A2 is the only big step.** It measures the recording, not the amount. A2 shares the held-out
  takes' microphone and room, which this similarity rewards, and A was recorded on another day. So
  part of A's gap is the channel, not the voice.
- **A2 ≈ B ≈ C.** Neither 13 nor 42 takes beat one good take on similarity. The styles barely
  widened the pitch range (2.70 → 2.83), and all of A2–E are flatter than the owner (3.5).
- **E**, a timbre prompt from three takes, was slightly worse than one well-chosen take.
- **The fine-tune adapters (D, D1, D3)** consistently widened the pitch range (3.0–3.2) without
  costing similarity. Per item the effect is uneven:
  - D's long passage reached 4.2 st, above the owner's narration (2.8–3.3), which looks more
    variable rather than more natural;
  - the spike's adapters stayed nearer 3.0–3.4.
- **Limits of these measures:**
  - Both encoders are Chatterbox's own, and C is conditioned on their averages, so similarity
    favours C-style voices.
  - Pitch spread can't tell lively from erratic.
  - There is no speech recognition on this computer, so pronunciation and dropped words weren't
    measured; listening has to judge them.

### The blind listening panel

The panel is at `.tools/hardening/panel/listen.html` (git-ignored, on this computer only). It has the
ten items, each read by A, A2, B, C, D and E under numbers shuffled for every item.

- **Rate each clip:** likeness and naturalness on a 1–5 scale, tick garbled words, and pick the best
  clip of each item.
- **Save** the answers to a file.
- **Score them:**

  ```
  ltts voice-panel score .tools/hardening/panel answers.json --pair C:A --pair C:B --pair D:C --pair C:A2
  ```

  This prints each voice's mean ratings with 95 % intervals and a paired sign test per pair.

- **Don't open `key.json`** before scoring.
- **One listener, ten items:** a p-value under 0.05 needs at least 9 of 10 items going one way, so
  treat close results as "no audible difference".

**Decision rule:**

- If C doesn't beat A2 and B by ear, the 48-passage session isn't earning its time.
- If D beats C on most items without more garbled marks, fine-tuning is worth pursuing.

## What the owner heard (blind panel, 2026-10-21)

One listener, ten items, each voice rated blind for likeness and naturalness (1–5):

| Voice                       | Likeness    | Naturalness | Best (of 10) | Garbled |
| --------------------------- | ----------- | ----------- | ------------ | ------- |
| B: early voice, 13 takes    | 3.60 ± 0.32 | 3.50 ± 0.53 | 2            | 1       |
| E: timbre from three takes  | 3.50 ± 0.44 | 3.30 ± 0.30 | 2            | 1       |
| C: complete voice           | 3.40 ± 0.52 | 3.10 ± 0.54 | 3            | 1       |
| D: C + fine-tune adapter    | 3.30 ± 0.59 | 3.10 ± 0.62 | 2            | 4       |
| A2: one take of the session | 3.50 ± 0.44 | 2.50 ± 0.60 | 0            | 2       |
| A: quick voice, another day | 1.70 ± 0.66 | 2.90 ± 0.74 | 1            | 1       |

Paired sign tests over the items:

- **B over A:** 9 better, 1 worse (p = 0.02): the studio session beats a quick clone clearly.
- **C over A:** 7 better, 2 worse (p = 0.18).
- **C over B:** 3 better, 4 worse, 3 tied: no difference.
- **D over C:** 4 better, 5 worse, and D was marked garbled most often.

So the panel agrees with the measurements:

- careful recording is what makes a studio voice sound like the speaker;
- about a dozen takes do as well as 42;
- the fine-tune doesn't help yet.

The owner's notes, checked:

- **Questions and exclamations lacked inflection.** This is not the recordings.
  - The owner's question takes moved 3.7–5.9 semitones and the exclamations up to 5.7, all clean
    (35–38 dB signal-to-noise).
  - The generated ones moved 1.7–2.9.
  - Two levers were tried on six unseen sentences with three seeds each (clips in
    `.tools/hardening/expressive/`):
    - livelier sampling (temperature 0.95) lost the questions' rise (+1.6 → −0.5 st);
    - a style prompt from the single most animated take was flatter still.
  - Turbo has no expression control (it ignores `exaggeration`). The original Chatterbox 0.5B keeps
    it, and testing that needs the owner's approval to download its weights.
- **Unusual words** (gnocchi, quinoa, Nguyen) were garbled by every voice, including the quick clone.
  Pronunciation comes from the engine's text model, not from the recordings. The pronunciation
  dictionary (a respelling per word) is the fix today.
- **Static during speech but silence in the pauses.** This was the app: it added digital silence
  after sentences and between narration and quotes. Fixed: pauses now carry the clip's own room
  tone, and digital silence in a passage fell from 8 % to the fades alone.
- **Style changes didn't flow, and calm lines sounded least like the owner.** Each sentence takes
  its style prompt on its own, with no memory of the one before. That is a limit of zero-shot
  synthesis sentence by sentence; nothing was changed.
- **An inner thought read like quoted speech.** Unquoted sentences are read as narration, and
  inner monologue isn't detected. A sentence can be given the calm style by hand.

## Fine-tuning (`feat/voice-tune`), reviewed

- **What it changes.**
  - A rank-16 LoRA (alpha 32) on Turbo's T3, a GPT-2 medium model: the attention and MLP projections
    of all 24 blocks. That is 96 layers and 6.29 M parameters.
  - S3Gen, which makes the timbre, and both speaker encoders are untouched. So it can change rhythm,
    inflection and pronunciation, but not the sound of the voice directly.
- **Data.** 42 whole takes (6.7 minutes), or 72 pieces when takes were split into sentences. The
  last take of each passage group is held out (six takes).
- **Are the held-out takes independent?**
  - Their **text** is unseen.
  - Their **speaker, microphone, room and session** are the same, which is fine for measuring
    adaptation to this speaker.
  - The best epoch was **chosen** on those same six takes, so the reported 4.10 → 3.89 is
    optimistic. There was no separate validation set.
- **Memorisation.** Training loss keeps falling (3.37 by epoch 8) while held-out loss turns up after
  epoch 3–4. The adapter starts memorising early; stopping early limits that, with only 42 takes.
- **Stability.**
  - "Three runs agreed" were three settings (split or not, 5 or 8 epochs) with the **same seed**, so
    they aren't a test of seed stability.
  - The three adapters here agree on the direction (wider pitch range, same similarity) but not per
    item.
- **Longer passages.** Similarity held on the 47 s passage (0.955–0.960 against C's 0.955).
- **Unusual words.** Not measurable without speech recognition: the listening panel's "garbled"
  marks are the evidence.
- **Regressions.**
  - The worker's base audio is bit-identical after an adapter is removed: verified here on the
    branch's `Adapters` code.
  - A replication of the app's synthesis matched the real engine bit for bit on three items before
    any adapter was applied.
- **Verdict.**
  - Keep it experimental and unmerged until the panel shows D preferred over C.
  - If it is pursued:
    - choose epochs on a validation take that isn't the reported test set;
    - run at least three seeds;
    - add a word-error check, which needs a small local speech-recognition model and the owner's
      approval to download.

## What could make 30 minutes matter

1. **Fine-tune T3 (the branch).** It is the only learning Turbo allows today. The gains are prosodic
   and modest, and published adaptation results agree (see [engine comparison](engine-comparison.md)).
2. **Prompt per sentence from all takes.** Choose each sentence's T3 prompt from the take most like
   it: kind, length, punctuation. Every take would then become a prompt that can be used. This is
   cheap to try and nothing has to be trained; it isn't built yet.
3. **Adapt the timbre (S3Gen).** No toolkit supports it for Turbo, and it would need a separate
   study.
4. **An engine with official fine-tuning of the whole voice.** VoxCPM (Apache-2.0) or GPT-SoVITS
   (MIT), as an optional second studio engine. That is a significant change needing the owner's
   approval and downloads; see the [engine comparison](engine-comparison.md).

Until one of these is shown to win by ear, the honest product is a shorter session that records what
the voice uses, says plainly that no model is trained, and stops when more recordings wouldn't change
anything.

## Reproducing this

The experiment scripts aren't part of the app. They:

- build voices with `session_identity`, `rank_prompts`, the five-candidate audition and
  `build_styles` from a set of takes;
- synthesise with the real engine;
- add the adapter on a worker-level replication, checked bit for bit against the engine.

Builds, clips, measurements (`analysis.json`) and the panel are in `.tools/hardening/`. Scoring
uses `ltts voice-panel`, which is part of the app.
