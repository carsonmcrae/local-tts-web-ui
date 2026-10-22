---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: changed
---

## Improved

- Each voice card now shows a one-line credit naming the model behind the voice, its licence and
  that the voice is synthetic, with a Credits link to the full wording, given once at the end of the
  Voices page.

## Fixed

- On very narrow phone screens, the Voices page no longer scrolls sideways.
- A voice that can't be used yet is no longer greyed out, which made its card hard to read; it has
  a dashed outline and still says its engine isn't installed.

## Technical

- `VoiceInfo.credit` (one line for the card) beside `VoiceInfo.attribution` (the full wording), both from
  `ltts.engines.credits` (`KOKORO`, `CHATTERBOX`, `CLONED`, `BLEND`). The full Kokoro wording credits
  everything `apps/desktop/licenses/kokoro/README.txt` credits (StyleTTS 2 by yl4579, Koniwa by tnc under
  CC BY 3.0, SIWIS under CC BY 4.0, no affiliation), and a test keeps the two in step.
- `VoiceCredits` shows each distinct attribution once with the voices it covers and where the licence texts
  are; a card's Credits link scrolls to it and moves focus there without changing the address.
- The voice grid is `grid-cols-1` below `sm`, so a Mandarin voice's truncated language line no longer
  widens the implicit column past a 320 px screen.
- An unavailable voice card is `border-dashed` instead of `opacity-70`: the dimming took its avatar
  initials and badges to 3.1–4.3:1, which axe flagged as `color-contrast` on `/voices` in both themes
  (`tests/e2e/states.spec.ts`).
