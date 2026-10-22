# Narrator programme: authorized human voices for TTSNative (proposal)

> **In short:** TTSNative would ship a small set of narrator voices only from adults who have read a
> plain-language explanation, made their own choices and signed a specific licence that lets TTSNative
> build a synthetic voice from their recordings, offer it as an optional download, and let people use it.
> Voices are labelled synthetic, credited as the narrator wishes, cannot be re-shared as voice files, and
> are withdrawn from the catalogue on request. Nobody has been contacted and no permission exists yet.

**Status:** proposal for the owner and for counsel, 2026-10-22. Not legal advice. No speaker has been
contacted and no permission has been obtained; contacting anyone needs the owner's approval of the person,
the channel and the message. Background: [the voice library research](../research/voice-library.md)
(sections 2 and 7) and the [legal risk audit](legal-risk-audit.md).

## 1. Principles

1. **The person, not the dataset, gives permission.** A public-domain or CC0 recording settles who may copy
   the audio; it does not settle whether its speaker agrees to a synthetic copy of their voice reaching
   strangers. Every programme voice needs the speaker's own written, specific, informed permission.
2. **Informed means specific.** The narrator is told what a synthetic voice is, where it goes, what people
   can make with it, what can go wrong, and what cannot be undone (copies already downloaded).
3. **Choices, not a single yes.** Commercial use, credit and purpose limits are the narrator's to set.
4. **Least data.** Recordings stay private to the programme; only the voice asset ships.
5. **Always labelled synthetic,** never presented as a recording of the narrator.
6. **No public figures,** no voices that imitate someone else, no minors.

## 2. The rights TTSNative needs

| Right                        | What it covers                                                                                                                               | Proposed default                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Use of the recordings        | Use recordings the narrator makes or owns to build the voice. Stored privately, never published or sold.                                     | Required                                                      |
| Creating the voice           | Create, tune and update synthetic voice assets from them (conditioning, speaking styles, an optional fine-tuned adapter) for TTSNative only. | Required; no use to train other models                        |
| Distribution                 | Offer the voice pack free through TTSNative's official catalogue, worldwide, to anyone using TTSNative.                                      | Required                                                      |
| Use by people                | People generate speech with the voice on their own computers and publish what they make (audiobooks, podcasts, accessibility, study).        | Required                                                      |
| Commercial use of the output | Selling or monetising what people make with the voice.                                                                                       | **Narrator's choice**; recommended "allowed" (see below)      |
| Redistribution of the pack   | Anyone else re-hosting or sharing the voice file.                                                                                            | **Not granted**: official catalogue only, so withdrawal works |
| Name and credit              | Showing the narrator's chosen credit (real name, public name, or none) in the app, website and release notes.                                | Narrator chooses; no endorsement implied                      |
| Reproduction of identity     | The narrator's express authorization to reproduce their recognisable voice synthetically for the purposes above.                             | Required, in the narrator's own words in the signed licence   |
| Purpose limits               | Uses the narrator forbids, shown to everyone who downloads the voice.                                                                        | Standard list below, plus any the narrator adds               |
| Duration and withdrawal      | How long the licence lasts and what withdrawal does (section 5).                                                                             | Until withdrawn; generated audio stays licensed (to confirm)  |

**Commercial use.** TTSNative is local software: it cannot technically stop someone selling an audiobook
made with a voice. A non-commercial voice is therefore labelled as such and its condition is shown when
exporting, but the narrator should know that enforcement rests on the licence, not on the software.
Asking for commercial use, and saying so plainly, avoids promising a protection the app can't deliver.

**Standard prohibited uses** (shown with every programme voice): impersonating the narrator or anyone else;
fraud, scams or getting around voice authentication; harassment or defamation; sexual content (unless the
narrator allows it); political advertising, campaigning or endorsements; presenting the voice as the
narrator's real recording or personal opinion; anything unlawful where the user lives.

**The narrator warrants** that they are the person in the recordings and an adult; that the recordings are
their own work; and that no other agreement forbids this (for example an exclusive audiobook contract or
union terms on digital replicas).

**TTSNative commits** to: label the voice synthetic; credit as chosen; watermark generated audio where the
engine does (Chatterbox Turbo marks every clip with Resemble AI's Perth watermark); never sell the
recordings; use them only for this voice; honour withdrawal (section 5); tell the narrator about misuse
reports concerning their voice.

## 3. The permission process

1. **Candidate approved by the owner,** with the channel and the first message (section 8).
2. **First contact** through the documented channel only (for LibriVox readers, a private message on the
   LibriVox forum, following LibriVox's etiquette; for a dataset publisher, its published address).
3. **Information sheet** in plain language: what a synthetic voice is; how it is built and shipped; what
   people could do with it, good and bad; the watermark and labelling; that downloaded copies can't be
   recalled; how withdrawal works; that saying no has no consequence.
4. **Choices form:** commercial use yes or no; credit (real name, public name, or none); extra purpose
   limits; a contact address for notices.
5. **Independent advice offered.** The narrator is encouraged to ask a lawyer or their union. Some laws make
   digital-replica terms enforceable only when the intended uses are specifically described and the person
   had legal or union representation; California's Labor Code section 927 (2024's AB 2602) is one such rule
   (counsel to confirm whether and how it applies to a free, volunteer licence). The licence describes the
   uses specifically in any case.
6. **Identity check:** the request is answered from the account or address the narrator is publicly known
   by (for a LibriVox reader, the forum account named on their reader page), plus a short call or a recording
   of a one-time phrase, and a statement that they are an adult. Proportionate, and no identity documents
   are kept.
7. **Signature** of the narrator licence (a template drafted by counsel from the term sheet in section 2),
   countersigned for TTSNative.
8. **Consent record, kept privately** (never in the public repository): who, how to reach them, the date,
   the licence version, their choices, the identity check and the signature. Retained as long as the voice is
   distributed and for a set period after withdrawal (counsel to set).
9. **Recording:** the narrator records a Voice Studio session at home (its 48 passages are the script and its
   checks catch noise and clipping) or supplies recordings they own; at least 10 minutes of clean speech.
10. **The narrator hears the result** on the held-out benchmark passages and approves it before release.
11. **Evaluation gate** (section 8).
12. **Release** in the catalogue with the credit, licence summary and authorization date.

## 4. Attribution

- **In the app:** the voice card shows "Synthetic voice of <credit>, used with permission since <date>",
  the licence summary (for example "commercial use allowed" or "non-commercial use only") and a link to the
  full licence. A narrator who chose no credit is shown as "a volunteer narrator".
- **On the website and in release notes,** only once a released version contains the voice.
- **In exports:** TTSNative keeps exported audio free of branding. For a programme voice, the export dialog
  shows the credit and any licence condition, and offers (unticked) to add the credit to the file's comment
  tag. A licence that requires credit in published works says so there.
- **In the voice-pack repository:** a credits file listing every voice, its narrator credit, licence and
  date.

## 5. Withdrawal and takedown

**Narrator withdrawal**, at any time, by a published address or form:

1. Acknowledged within 7 days.
2. Removed from the catalogue within 30 days and added to a signed withdrawal list in the catalogue.
3. When the app next refreshes the catalogue (only when the person asks or has update checks on), it marks
   the voice withdrawn: no new downloads, a notice on the installed voice, and it is no longer offered for
   new reading; the person can remove it with one click.
4. The private recordings are deleted; the consent and withdrawal records are kept as proof.
5. **What can't be undone,** said plainly in the information sheet: copies already downloaded on offline
   computers, and audio people already made. The licence states whether audio made before withdrawal stays
   licensed (proposed: yes, to be fair to people who relied on it; counsel to confirm).

**Third-party takedown** (someone says a voice imitates them, or that the narrator had no right to grant
it): downloads are suspended at once while both sides are asked for evidence; a decision is recorded within
30 days; a voice found to imitate someone else is withdrawn as above.

**Misuse reports** about generated audio go to the existing security and misuse channel; the narrator is
told when a report concerns their voice.

## 6. Sharing and exporting voice packs

- **Programme voices can't be exported as `.ttsvoice` files.** Sharing a voice file would bypass the
  catalogue, its terms and withdrawal. The existing export ([ADR-12](../architecture/decisions.md)) stays
  for people's own voices, which they made with their own consent statement.
- **People can share what they make** with a programme voice, within its licence.
- **Technically:** catalogue voices are installed by the model store (pinned HTTPS URL, size and SHA-256,
  atomic, resumable, cancellable, removable, offline after install, no code executed), recorded with source
  "catalogue", and refused by the export endpoint, with tests.

## 7. Packaging

- A voice-pack manifest per voice: id, display name, credit, licence summary and full-licence link,
  authorization date, version, required engine (Chatterbox Turbo, optional install), hardware advice
  (an NVIDIA GPU recommended; measured real-time factor 0.74 to 0.81 on an RTX 3080 under load), and every
  file with its pinned URL, size and SHA-256.
- Hosted as release assets of a separate repository (for example `carsonmcrae/ttsnative-voices`) so the
  MIT application repository holds no voice data and each pack carries its own licence.
- Size per voice: about 2 MB (measured on a built studio voice: a 1.2 MB reference clip, a 0.2 MB
  conditioning file and small speaking-style files); an optional fine-tuned adapter adds about 13 MB.

## 8. Recruiting and evaluating the first group

**Goal:** four to six voices that sound clearly different (US and UK; warm, deep, expressive, neutral),
from eight to ten candidates.

**Where candidates could come from** (no contact without the owner's approval of each one):

- **LibriVox readers** with long, clean solo work, for example the ten readers behind the Hi-Fi TTS dataset
  (17 to 58 hours each), by the public names on their reader pages. Their existing recordings are in the
  public domain as audio, so the ask is only for permission, plus an optional new session.
- **Dioco,** to confirm that Jenny herself agreed to synthetic distribution to other applications' users
  (the publisher's licence already allows commercial use with the credit "Jenny (Dioco)").
- **An open call** on the website and GitHub for adult volunteers to record a Voice Studio session, with the
  information sheet up front.
- Not others' donors: volunteers who donated to another project (for example Kyutai's) agreed to that
  project's terms, not TTSNative's.

**Screening:** identity and age (section 3); a microphone check and at least 10 minutes of clean speech; no
conflicting contracts; not a public figure; not a voice that imitates someone.

**Evaluation,** blind and fixed in advance:

1. Each candidate's voice reads the held-out narration corpus (`tests/perf/narration_benchmark.py`).
2. At least three listeners (the owner and two others) rate it blind against Kokoro's default voice and
   the Chatterbox default on the panel and long-form pages.
3. A voice joins only if, for at least two of three listeners, its naturalness beats the Kokoro default on
   the paired sign test (p < 0.05), it has no more garbled or mispronounced words than that baseline, and the
   long-form notes show no fatigue problem.
4. Two candidates that listeners can't tell apart in a blind ABX test don't both ship.
5. The narrator approves the final voice.

**Effort (estimate):** licence template from counsel, then about a day per narrator for contact, session,
build and review, plus listening time.

## 9. Questions for counsel

1. The licence template, consideration (volunteer or honorarium), governing law and venue.
2. Digital-replica contract rules (California Labor Code section 927 and any similar state laws) for a free,
   volunteer, worldwide licence; the ELVIS Act, since the publisher is in Tennessee.
3. Narrators in the EU or UK: voice recordings and voice models as personal data; consent as the lawful
   basis; erasure on withdrawal against copies already distributed.
4. EU AI Act Article 50 labelling of synthetic audio.
5. Whether audio generated before withdrawal stays licensed, and how to say so.
6. Whether honoraria create tax or employment obligations.
