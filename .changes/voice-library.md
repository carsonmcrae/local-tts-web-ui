---
bump: minor
---

## Improved

- English voices read money, clock times and phone numbers the way a narrator does where the meaning
  is clear: £1,284.50 is "1,284 pounds 50", "at 4:45 p.m." is "at 4 45 PM", and a phone number is
  read digit by digit. Code, formulas, ratios and lists of numbers are read as before.
- English voices read years and abbreviations naturally too: "in 1998" is "in nineteen ninety-eight",
  Chapter IV is "Chapter 4", and Lt. Col., Rev., Mt., Rd., Ave., Ms. and approx. become words. The
  text you see never changes, and a pronunciation you saved still wins.
- Every voice card says where its voice comes from and under what licence, and that it is synthetic
  speech rather than a recording of a person.

## Technical

- `synthesis/english.py`: bounded regular-expression rewrites applied to English voices of every
  engine after the pronunciation dictionary, skipped for sentences that look like code or a formula;
  times, years and digit-by-digit numbers need context; idempotent. The spoken text is part of the
  audio cache key, so the sentences it changes render again once. 219 rule cases and path tests
  (dictionary precedence, written text and subtitles unchanged, playback, export, regeneration,
  preview and speech API saying the same words).
- `VoiceInfo.attribution` on the voices API; web types regenerated.
- `tests/perf/narration_benchmark.py` and `narration_corpus.json`: thirteen held-out passages read
  through the real synthesis path; cold and warm starts, memory, GPU and signal measurements with a
  recorded environment; refuses to write audio where Git would track it; blind listening packs.
- `tests/perf/g2p_compare.py` and `g2p_corpus.json`: a blind espeak-ng versus misaki comparison with
  catch trials, confidence intervals and a pre-registered decision rule (misaki is not installed in
  the app). Narrator programme proposal in `docs/legal/narrator-programme.md`.
  Research and proposals in `docs/research/voice-library.md`; `ltts voice-panel score --pair A,B`
  pairs voice ids that contain colons.
