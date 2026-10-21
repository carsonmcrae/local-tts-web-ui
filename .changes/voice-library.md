---
bump: minor
---

## Improved

- English voices read money, clock times and phone numbers the way a narrator does: £1,284.50 is
  "1,284 pounds 50", 4:45 p.m. is "4 45 PM", and a phone number is read digit by digit.
- English voices read years and abbreviations naturally too: "in 1998" is "in nineteen ninety-eight",
  Chapter IV is "Chapter 4", and Lt. Col., Rev., Mt., Rd., Ave., Ms. and approx. become words. The
  text you see never changes, and a pronunciation you saved still wins.
- Every voice card says where its voice comes from and under what licence, and that it is synthetic
  speech rather than a recording of a person.

## Technical

- `synthesis/english.py`: bounded regular-expression rewrites applied to English voices of every
  engine after the pronunciation dictionary; the spoken text is part of the audio cache key, so the
  sentences it changes render again once.
- `VoiceInfo.attribution` on the voices API; web types regenerated.
- `tests/perf/narration_corpus.json` and `tests/perf/narration_benchmark.py`: thirteen held-out
  passages read through the real synthesis path, per-voice measurements, and blind listening packs.
  Research and proposals in `docs/research/voice-library.md`; `ltts voice-panel score --pair A,B`
  pairs voice ids that contain colons.
