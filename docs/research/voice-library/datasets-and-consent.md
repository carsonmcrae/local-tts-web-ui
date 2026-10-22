<!-- Research notes written by a reading-only research helper on 2026-10-21 for docs/research/voice-library.md; every fact is labelled, nothing was downloaded or run, and no page's instructions were followed. Not legal advice. -->

# Human speech sources for TTSNative narration voices: licences and speaker consent

Read-only web research, all facts read on 2026-10-21 unless a page's own date is quoted.
Method: WebFetch and WebSearch only; nothing downloaded, cloned, installed or run; no audio opened.

Labels used throughout:

- **documented** = read on the cited page (URL given).
- **claimed** = an author's or poster's own unverified statement.
- **inference** = my reasoning from documented facts.
- **search-index** = text returned by a search engine's snippet of a page I could not render myself (weaker than documented).

Licence and terms notes here are not legal advice. Quotes are verbatim and short; a licence is never paraphrased as broader than its words.

The seven rights, as the maintainer framed them: (1) copyright/licence of the recording; (2) licence of the dataset built from it; (3) right to train or fine-tune a voice model; (4) right to redistribute resulting weights/voice assets; (5) right to use generated speech commercially; (6) the speaker's express authorization to reproduce their recognizable voice identity synthetically for distribution to third-party application users; (7) stated restrictions.

Convention: rights 3-5 are reported as "permitted by licence wording" only where the licence text itself is broad enough (CC0, public domain, BSD-style "use in any form"); a licence that does not mention models is reported as "not addressed", not as permission. Right 6 is reported as documented only where the speaker's own statement, or a publisher statement that names the speaker's consent, was read.

---

## 1. One-paragraph answer

Only two sources read today combine a permissive recording/dataset licence with a speaker-level statement that reads as express authorization to reproduce the speaker's voice synthetically: **Thorsten-Voice** (German; the speaker publishes his own CC0 datasets, states they are "Intended for text-to-speech (TTS) model training" and "commercial speech technology development", and that "All recordings were created with the explicit intention of unrestricted public release under CC0") and, at a much smaller scale, the **Piper "bryce" voice** (the speaker's own ~750 self-recorded samples, dedicated public domain, "Feel free to use these for any legal and ethical purpose"). **Jenny (Dioco)** is the strongest English candidate: the publisher's licence expressly permits commercial use and audio generation and only requires naming the voice "Jenny (Dioco)", but the page gives no statement by the speaker herself and does not say under what arrangement she recorded, so I class it "suitable at publisher level; confirm with Dioco". The **Kyutai Unmute voice-donation** set (CC0, consent boxes per purpose) looks like the model of a consent-first programme, but its terms exist only as PDFs my tool could not parse, so it is "pending verification". Everything derived from **LibriVox** (LibriVox itself, M-AILABS, LJSpeech, Hi-Fi TTS, LibriTTS/-R, Bryce Beattie's LibriVox voices) is permissively licensed for the recording and dataset, but **no reader's authorization for synthetic voice identity is documented anywhere I could read**; LibriVox's own wording is a public-domain dedication of the recordings, and the NVIDIA Hi-Fi TTS authors explicitly treated reader consent as a separate step they took before using a voice in a TTS application. These are "unsuitable for official distribution pending authorization". **Common Voice** fails right 6 outright: its downloader terms require you not to "attempt to determine the identity of speakers", which is the opposite of distributing a recognizable identity, and per-speaker audio is tiny on average. **CMU ARCTIC**, **VCTK**, **OHF-Voice/Nabu Casa** and **Effect AI** are permissively licensed but their speakers' consent to identity reproduction is not documented (ARCTIC/VCTK speakers are anonymous IDs; Effect AI forbids identifying speakers). **Blizzard 2013 Lessac**, **RyanSpeech**, **Expresso**, **EARS**, **Hi-Fi-CAPTAIN** and the Mycroft **Kusal** and **Alan Pope** voices are unsuitable: non-commercial, research-only, unpublished, or (Alan Pope's Mimic 3 voice) carrying an "All Rights Reserved" LICENSE file.

---

## 2. Summary table

Columns: recording licence | dataset licence | train/fine-tune (3) | redistribute weights (4) | commercial output (5) | speaker identity authorization (6) | restrictions (7) | verdict.

| Source                                                   | (1) Recording                                                               | (2) Dataset                                                         | (3)                                                                 | (4)                                             | (5)                                        | (6) Speaker identity                                                                                                               | (7) Restrictions                                                                                                 | Verdict                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| LibriVox (raw)                                           | Public-domain dedication (documented)                                       | n/a                                                                 | PD wording permits "anything"                                       | same                                            | same ("even to sell them")                 | **Not documented**                                                                                                                 | "public domain in the USA, but not necessarily in other countries"; credit preferred, not required               | Pending authorization                              |
| M-AILABS (mirror)                                        | LibriVox PD, "except for Ukrainian"                                         | BSD-style: "use in any form, including any commercial use"          | permitted by wording                                                | permitted by wording (retain notice)            | permitted by wording                       | Not documented                                                                                                                     | Retain copyright notice; no endorsement; Ukrainian "for machine learning purposes only" (contradiction on page)  | Pending authorization; Ukrainian subset Unsuitable |
| LJSpeech (Linda Johnson)                                 | LibriVox PD                                                                 | "public domain in the US (and most likely other countries as well)" | permitted by wording                                                | permitted                                       | permitted                                  | Not documented                                                                                                                     | "use this dataset for good and not evil" (request)                                                               | Pending authorization                              |
| Hi-Fi TTS (NVIDIA, 10 readers)                           | LibriVox PD                                                                 | CC BY 4.0                                                           | CC BY 4.0 does not address models; adaptation permitted             | attribution duty                                | permitted                                  | Not documented for dataset; authors "sought the written consent of the speaker" for one TTS application (which speaker not stated) | Attribution                                                                                                      | Pending authorization                              |
| LibriTTS / LibriTTS-R                                    | LibriVox PD                                                                 | CC BY 4.0                                                           | as above                                                            | attribution                                     | permitted                                  | Not documented                                                                                                                     | Attribution                                                                                                      | Pending authorization                              |
| Common Voice                                             | CC0 (contributor terms not readable today)                                  | CC0 + downloader terms                                              | CC0 wording permits                                                 | CC0                                             | CC0                                        | **Not documented; contradicted in spirit** by "not attempt to determine the identity of speakers"                                  | No speaker identification; Data Collective: no re-hosting; ~2.3 min/speaker average (inference)                  | Unsuitable                                         |
| Jenny (Dioco)                                            | Dioco custom licence                                                        | same                                                                | "suitable for training a TTS model"; "Commercial use is permitted." | not addressed; "No further restrictions apply." | permitted                                  | Publisher-level only; speaker's own statement not documented                                                                       | Must call the voice "Jenny" / "Jenny (Dioco)" in interfaces that generate audio; don't claim dataset as your own | Suitable at publisher level; confirm with Dioco    |
| Thorsten-Voice (DE)                                      | CC0, self-recorded                                                          | CC0                                                                 | "Intended for text-to-speech (TTS) model training"                  | CC0                                             | "commercial speech technology development" | **Documented** (speaker's own publication and statements)                                                                          | "None from the licensor's side"; users responsible for laws/ethics                                               | Suitable (German)                                  |
| Alan Pope (Mimic 3 apope_low)                            | Not published; recorded for Mycroft via VocalID                             | Model LICENSE: "Copyright 2022 Mycroft AI" / "All Rights Reserved"  | not granted                                                         | not granted                                     | not granted                                | Blog shows good humour about fan use; no licence or authorization statement                                                        | All rights reserved                                                                                              | Unsuitable (contradicts Piper's "See URL")         |
| CMU ARCTIC                                               | CMU 2003 permissive (read from mimic3-voices copy; festvox.org unreachable) | same                                                                | "for any purpose"                                                   | retain notice, mark modifications               | permitted by wording                       | Not documented; anonymous speaker IDs                                                                                              | Keep notice, mark changes, keep authors' names                                                                   | Pending authorization (speakers not contactable)   |
| VCTK                                                     | CC BY 4.0                                                                   | CC BY 4.0                                                           | adaptation permitted                                                | attribution                                     | permitted                                  | Not documented; anonymous IDs; "originally aimed for HMM-based text-to-speech"                                                     | Attribution                                                                                                      | Pending authorization (speakers not contactable)   |
| Blizzard 2013 Lessac                                     | Research Licence Agreement (search-index; host unreachable)                 | same                                                                | research only (search-index)                                        | no                                              | no                                         | Not documented                                                                                                                     | rights "remain with Voice Factory and Lessac"                                                                    | Unsuitable                                         |
| RyanSpeech                                               | Paper: "CC BY-NC-ND"; Piper card: "CC BY-NC-SA 4.0" (contradiction)         | same                                                                | NC                                                                  | NC                                              | NC                                         | Not documented ("professional voice actor")                                                                                        | Non-commercial                                                                                                   | Unsuitable                                         |
| Expresso (Meta)                                          | CC BY-NC 4.0                                                                | same                                                                | NC                                                                  | NC                                              | NC                                         | Not documented                                                                                                                     | Non-commercial                                                                                                   | Unsuitable                                         |
| EARS (Meta/UHH)                                          | "CC-NC 4.0 International"                                                   | same                                                                | NC                                                                  | NC                                              | NC                                         | Not documented                                                                                                                     | Non-commercial                                                                                                   | Unsuitable                                         |
| Piper kusal (Mycroft)                                    | Not published ("not available", "premium offering")                         | "See URL" (mimic2 repo; no dataset there)                           | no licence found                                                    | no                                              | no                                         | Not documented                                                                                                                     | Unknown                                                                                                          | Unsuitable                                         |
| Piper bryce (own voice)                                  | Public domain, self-recorded                                                | public domain                                                       | "any legal and ethical purpose"                                     | permitted                                       | permitted                                  | **Documented** (speaker = publisher)                                                                                               | Only ~750 samples                                                                                                | Suitable (small)                                   |
| Piper john/norman/cori/kristin (Bryce Beattie, LibriVox) | LibriVox PD                                                                 | "public domain"                                                     | permitted by wording                                                | permitted                                       | permitted                                  | Not documented; readers not named on page                                                                                          | none stated                                                                                                      | Pending authorization                              |
| OHF-Voice / Nabu Casa (joe, kathleen, 25 others)         | CC0 crowdsourced                                                            | CC0                                                                 | CC0                                                                 | CC0                                             | CC0                                        | Not documented (no contributor terms on page)                                                                                      | "please cite this repository"                                                                                    | Pending authorization (ask Nabu Casa)              |
| Hi-Fi-CAPTAIN (hfc_*)                                    | CC BY-NC-SA 4.0                                                             | same                                                                | NC                                                                  | NC                                              | NC                                         | Not documented                                                                                                                     | Non-commercial, share-alike                                                                                      | Unsuitable                                         |
| Kyutai Unmute donations                                  | CC0                                                                         | CC0                                                                 | consent box "develop TTS models" (search-index)                     | CC0                                             | CC0                                        | Per-purpose consent boxes (search-index of PDF terms)                                                                              | Deletion on request updates released datasets                                                                    | Pending verification of PDF terms                  |
| Effect AI Scripted Speech 1.0                            | CC0-1.0 (page also says CC-BY-4.0, conflict)                                | same                                                                | "informed consent ... research, model training"                     | CC0                                             | CC0                                        | Consent to training documented; identity reproduction not; "forbidden to attempt to determine the identity of speakers"            | No speaker identification                                                                                        | Pending / tension with right 6                     |
| CLEAR Global TWB (Kanuri)                                | CC BY-NC 4.0                                                                | same                                                                | NC                                                                  | NC                                              | NC                                         | Explicitly **withheld**: no synthetic speech "that could be used to impersonate the original speaker"                              | NC; no impersonation; no identification                                                                          | Unsuitable (instructive clause)                    |

---

## 3. Per-source notes

### A. LibriVox

**A1. Public-domain dedication wording (documented).** https://librivox.org/pages/public-domain/

- "if you record for LibriVox, all your recordings will be donated to the public domain"
- "LibriVox recordings are in the public domain, which means people can do anything they like with them."
- "you may do whatever you like with our recordings – you don't need permission"
- "This means anyone can use all our recordings however they wish (even to sell them)."
- "all our recordings are public domain in the USA, but not necessarily in other countries"
- The page lists as acceptable: sell them, broadcast them, "put them in commercials"; and says LibriVox would "much prefer" a credit with a link (documented preference, not a condition).
- No sentence on this page mentions AI, TTS, voice cloning, or the reader's voice identity (documented absence).

**A2. Wiki "Copyright and Public Domain" (documented; page shows last edit 5 August 2026).** https://wiki.librivox.org/index.php?title=Copyright_and_Public_Domain

- "anyone can use those audio files however they wish."
- "they do not need to give credit to the individual reader/writer/creator or to LibriVox."
- "People may use our recordings to profit;"
- Lists among past uses: "Used LibriVox recordings to train AI models" (documented; presented as an example of a permitted use of public-domain material).
- No statement that readers retain any right; no statement about voice identity (documented absence).

**A3. Wiki "LibriVox and Artificial Intelligence (AI)" (documented; page shows last edit 14 October 2026).** https://wiki.librivox.org/index.php?title=LibriVox_and_Artificial_Intelligence_(AI)

- "LibriVox has not, does not, and will not sell its recordings to anyone."
- "Therefore, it is legal for AI trainers to use them for anything without our/your permission, for free."
- Policy: LibriVox "does not allow" audio recordings, summaries or cover images made with AI; suspected cases: "Please contact the MC of the project or any other admin via private message."
- Documented absence: nothing on voice cloning of readers, nothing advising readers, nothing on how to contact readers about AI use.
- Inference: LibriVox's position is a legal-status statement (public domain) and an inbound content ban; it is not a grant or a refusal of anything on the reader's behalf, and it says nothing about identity/publicity rights.

**A4. Forum threads (not readable today).** https://forum.librivox.org/viewtopic.php?p=2304541 and ...?p=1940025 both returned HTTP 401 to my tool. Search-index snippets (weak): a staff post says LibriVox is for real people reading, not TTS audiobooks, and volunteers suspecting an artificial voice should message their MC; another poster notes cloning models need only short samples. I could not verify wording.

**A5. Third-party commentary (claimed, not LibriVox).** A VoiceProductions article (https://www.voiceproductions.com/en/news/ai-voices-are-built-on-stolen-data) argues readers "never imagined" reprocessing into commercial clones; an AIVille forum post by a self-described LibriVox reader says the terms prohibit AI recordings and that concerned readers "should think twice before recording". Both are opinions; not evidence of any reader's consent or refusal.

**A6. Contacting readers (documented).**

- https://librivox.org/pages/contact-librivox/ : "The best way to contact us is by posting on our Forum." General address info[AT]librivox[DOT]org. No reader-forwarding described on this page.
- "Thank a Reader" https://librivox.org/?p=31396 : "Thank you messages will be passed on to the relevant readers via private message on the LibriVox forum"; "Please send the reader a PM directly." (for forum users); "if a reader you thanked wishes to reply to you, we will privately pass on your email address."; "otherwise an admin will notify the reader with a link to your message."
- Wiki "How To Find A Reader" https://wiki.librivox.org/index.php/How_To_Find_A_Reader : "You can enter either the forum name or the catalogue name of the reader." (advanced catalogue search).
- Reader page structure, example https://librivox.org/reader/92 : heading "Works read by Cori Samuel", plain text "Forum name: Cori", 843 sections listed, no contact link, no profile link (documented). Inference: a reader's forum name is public on the reader page, so a forum PM is the documented route; email is not published.
- Feedback policy (search-index of https://librivox.org/?p=31375): LibriVox does not allow "unasked-for negative criticism" of recordings, in public posts or PMs/emails to readers. Relevant etiquette for any approach.

**A7. Narrators with long-form, consistent single-reader corpora (public names only; by documented hours, not by listening).**

- The Hi-Fi TTS paper's Table 2 (documented, https://ar5iv.labs.arxiv.org/html/2104.01497) lists ten readers selected for bandwidth >= 13 kHz and SNR >= 32 dB with at least 17.7 h each: 92 Cori Samuel (27.3 h), 6097 Phil Benson (33.5 h), 9017 John Van Stan (58.0 h), 6670 Mike Pelton (17.7 h), 6671 Tony Oliva (24.1 h), 8051 Maria Kasper (30.4 h), 9136 Helen Taylor (24.3 h), 11614 Sylviamb (22.2 h), 11697 Celine Major (26.8 h), 12787 LikeManyWaters (27.3 h). Reader ID 92 resolves to "Works read by Cori Samuel" at https://librivox.org/reader/92 (documented), so the IDs appear to be LibriVox reader IDs (inference from one match; verify others individually).
- LJSpeech: Linda Johnson, ~24 h, 7 non-fiction books (documented, https://keithito.com/LJ-Speech-Dataset/).
- M-AILABS en_US/en_UK readers: not named on any page I could read (see C).
- Bryce Beattie's john/norman/cori/kristin voices: 11.5-24 h each "from LibriVox.org", readers not named on his page (documented absence).
- No LibriVox leaderboard of prolific readers was found; LibriVox monthly statistics threads (forum, 401) give aggregates only (search-index: 9,870 completed solo projects, 13,428 readers as of October 2023).

**Verdict (A).** Rights 1-5: public-domain wording is as broad as wording gets, with the documented caveat that PD status is asserted for the USA. Right 6: not documented for any reader. Right 7: country caveat; credit preferred. Pending authorization.

### B. Mozilla Common Voice

**B1. Contributor legal terms and privacy notice: not readable today.** https://commonvoice.mozilla.org/en/terms and /en/privacy render only the title "Common Voice" without JavaScript. The repository paths I tried for the localisation strings (web/locales/en/messages.ftl, locales/en/messages.ftl, pages/terms.md) all returned 404; the repo root (https://github.com/common-voice/common-voice) shows top-level folders ".github, bundler, common, docker, docs, locales, maintenance, scripts, server, web" and says sentence text is "released under a CC0 public domain Creative Commons license" (documented). The exact contributor-facing wording (age eligibility, dedication sentence) therefore remains unquoted here.

**B2. CC0 and purpose (documented, Common Voice paper).** https://ar5iv.labs.arxiv.org/html/1912.06670

- "All of the speech data is released under a Creative Commons CC0 license."
- Corpus "intended for speech technology research and development", designed mainly for ASR.
- Speakers carry "an anonymized ID for the speaker"; age/gender/accent "optionally self-reported by the speaker".
- Documented absence: no TTS mention; no per-speaker clip distribution.

**B3. Downloader clause on identity (documented via Mozilla staff quote).** Mozilla Discourse, "Speaker IDs for Speaker Identification Model", reply by jesslynnrose, 17 May 2023 (no role displayed on page): https://discourse.mozilla.org/t/speaker-ids-for-speaker-identification-model/114358

- "You agree to not attempt to determine the identity of speakers in the Common Voice dataset"
- The terms would "bar the use of this data for use in processes that require identification of individual contributors"
- "There may be other, non-Mozilla voice datasets with different terms of use that might be a better fit for your project."
- Also search-index on current Data Collective language pages (e.g. Seediq 24.0): "By downloading this data you agree to not determine the identity of speakers in the dataset." and "It is forbidden to re-host or re-share this dataset."

**B4. Mozilla Data Collective consumer terms (documented; page says Last Updated May 06, 2026).** https://mozilladatacollective.com/terms/consumers

- Section 2(b)(viii): prohibits any attempt to "determine, trace, match the identity of, or re-identify the individual contributor or source of any data"
- Section 2(b)(ix): prohibits "hosting, storing or making the Dataset available on any platform, server or repository other than the Platform"
- Appendix 1 section 5: "Data Consumer may use the Dataset solely for purposes set forth in the Data Consumer License."
- Appendix 1 section 10 begins "Data Consumer shall ensure that any synthetic data, derivative datasets, or model outputs generated using the Dataset" (sentence continues; my tool cut it; read in full before relying on it).
- Documented absence: no mention of TTS, voice cloning, speech synthesis or biometrics.
- Hugging Face card https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0 : "Effective October 2025, Mozilla Common Voice datasets are now exclusively available through Mozilla Data Collective." Task listed: ASR.

**B5. Mozilla and TTS (documented thread; no official position found).** "Explicitly forbidding/limiting TTS usage?", started 3 June 2023: https://discourse.mozilla.org/t/explicitly-forbidding-limiting-tts-usage/115072

- Original poster bozden: "So, please forbid TTS usage explicitly in any legally binding documents/website phrasing (e.g. download page)."
- kathyreid: "The public domain licensing of Common Voice data means that it is difficult to restrict how that data is used."; proposes a data-trust with per-use permissions such as "I allow my data to be used for TTS."
- Quoted closed GitHub comment: "additional restrictions cannot be added to Creative Commons licenses."
- Inference: Mozilla has not published a TTS or voice-cloning position that I could find; the only operative limit is the identity clause.

**B6. Per-speaker amount (search-index figures; page itself did not render).** Common Voice Scripted Speech 25.0 English on Data Collective: 2,574,404 clips, 3,765.76 h, 99,724 speakers, average clip 5.266 s. Inference: mean ~2.3 minutes per speaker; distribution unknown (the paper does not report it). Far below the 17+ h per speaker of Hi-Fi TTS.

**Verdict (B).** Right 6: not documented, and the downloader clause forbids attempting to identify speakers, which an app that ships a named, recognizable voice would sit uneasily beside (inference). Data Collective terms also forbid re-hosting. Unsuitable for TTSNative's purpose.

### C. M-AILABS speech dataset

**C1. Mirror README (documented).** https://github.com/i-celeste-aurora/m-ailabs-dataset (and raw README on branch master)

- "This repository is only a placeholder for the actual Dataset." Download links point to ics.tau-ceti.space (not followed).
- Licence lines: "Copyright (c) 2017-2019 by the original creators @ M-AILABS" and "Copyright (c) 2020 I. Celeste Aurora Solak (github.com/i-celeste-aurora)"; "Redistribution and use in any form, including any commercial use, with or without modification are permitted"; "Redistributions of source data must retain the above copyright notice, this list of conditions"; "Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products"; standard AS-IS and liability disclaimers; and: "Any license restrictions you may find in downloaded data is removed herewith".
- Sources: "Most of the data is based on LibriVox and Project Gutenberg." Texts 1884-1964 public domain. "The audio was recorded by the LibriVox project and is also in the public domain - except for Ukrainian."
- Ukrainian audio was provided "for machine learning purposes only" (documented) - which contradicts the "removed herewith" sentence on the same page (documented contradiction).
- Composition: de_DE 237h22m; en_UK 45h34m; en_US 102h07m; es_ES 108h34m; it_IT 127h40m; uk_UK 87h08m; ru_RU 46h47m; fr_FR 190h30m; pl_PL 53h50m; total 999h32m.
- Audio: "All audio-files are in wav-format, mono and 16000 Hz."; clips 1-20 s; 0.5 s silence at both ends; clean (non-augmented) versions provided.
- Known problems: about six metadata rows whose wav is missing (en_UK 2, en_US 3, es_ES 1); Spanish "karen" is Mexican, "victor" is Argentinian; a malformed Ukrainian link; a truncated sentence.
- Reader and book names per language: **not documented** on any page I could read (the directory tree is shown only as an image). Speaker counts: MFA docs give Spanish 21 speakers (11 f / 10 m), 108.57 h (documented, https://mfa-models.readthedocs.io/en/latest/corpus/Spanish/M-AILABS%20Spanish.html); mimic3-voices lists en_US/m-ailabs_low with 3 speakers (documented).

**C2. Original caito.de page.** DNS lookup for www.caito.de failed today; web.archive.org is blocked for my tool. The original licence text could not be compared.

**C3. Does the mirror change terms?** Documented: the mirror's licence adds the 2020 copyright line and the "removed herewith" sentence. The copy of the licence shipped in MycroftAI/mimic3-voices (https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/en_US/m-ailabs_low/LICENSE) has the same BSD-style body but "contains no clause that removes or rescinds earlier restrictions" (documented), suggesting the removal sentence is the mirror's addition (inference). Inference, not legal advice: a mirror maintainer cannot lift a third party's "machine learning purposes only" condition on the Ukrainian audio; treat that subset as restricted.

**Verdict (C).** Rights 1-5 permitted by the BSD-style wording for LibriVox-derived languages, with notice-retention and no-endorsement duties; right 6 not documented; Ukrainian subset unsuitable. Pending authorization.

### D. Other LibriVox-derived datasets

**D1. LJSpeech (documented).** https://keithito.com/LJ-Speech-Dataset/

- "This dataset is in the public domain in the US (and most likely other countries as well)."; "There are no restrictions on its use."
- "Recordings by Linda Johnson from LibriVox."; "The audio was recorded in 2016-17 by the LibriVox project and is also in the public domain."
- 13,100 clips, total 23:55:17, 7 non-fiction books.
- "We request that you use this dataset for good and not evil." (request, not a condition).
- Contact: kito@kito.us. Speaker consent to synthesis: not documented.

**D2. Hi-Fi TTS (documented).** https://www.openslr.org/109/ : "License: CC BY 4.0"; "about 291.6 hours of speech from 10 speakers with at least 17 hours per speaker"; "based on public audiobooks from LibriVox and texts from Project Gutenberg". Reader table: see A7. Paper https://ar5iv.labs.arxiv.org/html/2104.01497 :

- "The dataset is based on LibriVox audiobooks and Project Gutenberg texts, both in the public domain."
- "when we selected a voice sample for a text-to-speech (TTS) application we sought the written consent of the speaker" (the sentence opens by acknowledging the source is public domain).
- "We believe it is ethically responsible to get the speaker's consent before using their voice for synthetic replication"
- "we strongly encourage other developers to seek such consent."
- Documented absence: the paper does not say which speaker, or whether consent was obtained for the dataset's other readers; the OpenSLR about page (https://openslr.org/resources/109/about.html) has no consent or licence text.
- Inference: NVIDIA's own practice treats the CC BY dataset licence and the speaker's consent to replication as separate; this is the closest thing to a precedent for the maintainer's right 6 in the LibriVox ecosystem.

**D3. LibriTTS and LibriTTS-R (documented).** https://www.openslr.org/60/ : "License: CC BY 4.0"; ~585 h at 24 kHz; "mp3 audio files from LibriVox and text files from Project Gutenberg". https://www.openslr.org/141/ : "License: CC BY 4.0"; "The constituent samples of LibriTTS-R are identical to those of LibriTTS, with only the sound quality improved." Speakers are LibriSpeech numeric IDs; consent not documented on either page. (Hi-Fi TTS speakers overlap with LibriSpeech IDs, inference from ID 92.)

### E. Consented or contracted single-speaker datasets

**E1. Jenny (Dioco) (documented).** https://github.com/dioco-group/jenny-tts-dataset

- "A high-quality, varied ~30hr voice dataset suitable for training a TTS model."; "Total is.. 22419 prompts".
- "Voice is recorded by Jenny. She's Irish." No surname; arrangement (paid/volunteer/contract) not documented.
- Licence: "Attribution is required in software/websites/projects/interfaces (including voice interfaces)" "that generate audio in response to user action using this dataset."; "Atribution means: the voice must be referred to as "Jenny", and where at all practical, "Jenny (Dioco)"."; "Attribution is not required when distributing the generated clips (although welcome)."; "Commercial use is permitted."; "Don't do unfair things like claim the dataset is your own."; "No further restrictions apply."
- "Jenny is available to produce further recordings for your own use." Contact dioco@dioco.io.
- Inference: the publisher's licence squarely contemplates models generating audio in third-party interfaces (rights 3-5 by wording; right 4 not mentioned but "No further restrictions apply"). Right 6 is documented at publisher level only; the speaker's own words are absent. Verdict: suitable at publisher level; a one-line confirmation from Dioco that Jenny consented to distribution of a synthetic voice would close the gap.

**E2. Thorsten-Voice (Thorsten Müller, German) - reference example (documented).**

- Zenodo 2021.02 https://zenodo.org/records/5525342 : "Creative Commons Zero v1.0 Universal"; "licenced under CC0 to provide it for anybody without any financial or licence struggle."; "Please use it to make the world a better place for whole humankind."; "more than 23 hours of pure audio", 22,668 wavs; published 10 Feb 2021.
- Mozilla Data Collective 2022.10 https://mozilladatacollective.com/datasets/cmm4b8y6100nomk07w678zb9d : "Creative Commons Zero v1.0 Universal (CC0-1.0)"; "Intended for text-to-speech (TTS) model training, speech synthesis research, benchmarking," and "commercial speech technology development."; "The dataset consists exclusively of voluntary recordings of the contributor's own voice."; "Users are responsible for complying with applicable laws and ethical standards."; Restrictions: "None. Released under CC0 (public domain dedication)."; Forbidden usage: "None from the licensor's side."
- TV-44kHz-Full https://mozilladatacollective.com/datasets/cmm4de9w500ntmh073nx14k7p : CC0-1.0; "Intended for high-quality text-to-speech (TTS), expressive and dialectal speech synthesis."; "All recordings were created with the explicit intention of unrestricted public release under CC0."; about 40 h, 38,000+ wavs, 44.1 kHz mono.
- GitHub https://github.com/thorstenMueller/Thorsten-Voice : "should be available for every project without any license struggling"; "I contribute my voice as a person believing in a world where all people are equal."; "Please keep in mind, that i am no professional voice talent."; citation "highly appreciated" (request).
- Site https://www.thorsten-voice.de/en/ : "I gave my own voice to the public out of deep conviction, so that exactly this becomes possible."; use cases listed include "Private, school, club or commercial use."
- Interview (claimed, his words as reported), netzpolitik.org, Martin Schwarzbeck, 21 March 2025, https://netzpolitik.org/2025/text-to-speech-dieser-mann-hat-seine-stimme-verschenkt/ : "Die Stimme ist ja etwas sehr Persönliches" (the voice is something very personal); "Was ist, wenn meine künstliche Stimme Dinge sagt, die mir total konträr sind?" (what if my artificial voice says things contrary to my views?); the article reports he weighed misuse (fake calls, a political misuse incident) and concluded the positive uses outweigh it.
- What makes this "express authorization" (inference): the speaker is the publisher; he names TTS training and commercial speech technology as intended uses; he states the recordings were made for unrestricted release; and his public remarks show he considered voice-identity misuse before deciding. No page I read contains the literal words "voice cloning permitted"; the authorization is the sum of the above.

**E3. Alan Pope (British English, Mycroft Mimic) (documented).**

- Piper card https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_GB/alan/medium/MODEL_CARD : dataset URL https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low ; "License: See URL"; "Finetuned from U.S. English lessac voice (medium quality)."
- That folder's LICENSE file (https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low/LICENSE) is two lines: "Copyright 2022 Mycroft AI" / "All Rights Reserved". README: model "based on Alan Pope's voice"; SOURCE file contains only https://popey.me/ , which says nothing about the dataset (documented). The repo README's voice table has no licence column (documented); the repo sidebar shows a CC-BY-SA-4.0 licence link (documented) - which file that covers is not stated.
- Blog (claimed), https://blog.popey.com/2022/10/blog-to-speech-in-my-voice/ : recorded ~3,500 sentences through VocalID's web interface at Mycroft's request; received a Mark I and "wasn't paid in any other way"; amused by fan projects; no licence and no restriction stated; the recording dataset's public availability is not stated.
- Contradiction: Piper's "See URL" resolves to an all-rights-reserved file. Verdict: Unsuitable; a direct, written grant from both Alan Pope and whoever now holds Mycroft AI's rights would be needed.

**E4. CMU ARCTIC.** festvox.org refused connections today (both the index and the COPYING file). The licence text shipped with the mimic3 cmu-arctic voice (https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/en_US/cmu-arctic_low/LICENSE, documented) reads: "Carnegie Mellon University" "Copyright (c) 2003" "All Rights Reserved."; "Permission to use, copy, modify, and license this software and its documentation for any purpose," "is hereby granted without fee, subject to the following conditions:"; "1. The code must retain the above copyright notice, this list of conditions and the following disclaimer."; "2. Any modifications must be clearly marked as such."; "3. Original authors' names are not deleted." Whether this is byte-identical to the festvox COPYING file is not verified. Speaker consent purpose: not documented on any reachable page; speakers are three-letter IDs. Verdict: pending; speakers cannot be approached.

**E5. VCTK (documented).** https://datashare.ed.ac.uk/handle/10283/3443 (DOI 10.7488/ds/2645); README: "This corpus is licensed under the Creative Commons License: Attribution 4.0 International"; "110 English speakers with various accents"; "This corpus was originally aimed for HMM-based text-to-speech synthesis systems." license_text.txt is the plain CC BY 4.0 legal code (documented). Consent form statements: not documented. Verdict: pending; anonymous speakers.

**E6. Blizzard Challenge 2013 Lessac.** Both CSTR hosts (www.cstr.ed.ac.uk, www.cstr.inf.ed.ac.uk) refused connections today. Search-index of https://www.cstr.inf.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html : a "Research Licence Agreement" with Voice Factory International and Lessac Technologies as licensors; "The audio rights, copyright and any other intellectual property rights remain with Voice Factory and Lessac."; unlicensed copies to be destroyed. The 2011 Lessac release page (search-index) says data "released under a license for non-commercial use only". Verdict: Unsuitable (research licence; re-read the page when reachable).

**E7. RyanSpeech (documented).** Paper https://ar5iv.labs.arxiv.org/html/2106.08468 : released "under the CC BY-NC-ND license"; "recorded in a studio by a professional voice actor"; >10 h at 44.1 kHz. Piper ryan card (https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/ryan/high/MODEL_CARD): dataset URL Kaggle, "License: CC BY-NC-SA 4.0" - contradicts the paper. Kaggle page and http://mohammadmahoor.com/ryanspeech/ returned 404; GitHub roholazandie/ryan-tts shows a "CC BY-NC 4.0" badge and a request form. Actor consent: not documented. Verdict: Unsuitable (every stated variant is non-commercial).

**E8. Expresso (documented).** https://speechbot.github.io/expresso/ : "The Expresso dataset is distributed under the CC BY-NC 4.0 license."; 4 speakers; ~40 h. Who the speakers were and consent: not documented. Unsuitable.

**E9. EARS (documented).** https://github.com/facebookresearch/ears_dataset : "The code and dataset are released under CC-NC 4.0 International license."; 107 speakers, 100 h anechoic 48 kHz; consent not documented. Unsuitable.

**E10. Rhasspy/Piper contributor voices (documented from model cards at https://huggingface.co/rhasspy/piper-voices/raw/main/en/...).** The Piper VOICES.md (https://github.com/rhasspy/piper/blob/master/VOICES.md) lists voices without licences; the repo is archived read-only since 6 October 2025 (documented).

- en_US/kusal: dataset "https://github.com/MycroftAI/mimic2", "License: See URL"; the mimic2 README does not mention a Kusal dataset (documented). Mycroft forum, 21 Nov 2018, KathyReid: "the pre-trained Mimic 2 voice, the `Kusal` voice, is not available."; "a premium offering for our Subscribers" (https://community.openconversational.ai/t/mimic-ii-pre-trained-model/5174). Publisher: Mycroft AI. Unsuitable.
- en_US/bryce: "This is my voice, I only recorded about 750 samples."; licence "public domain"; his site https://brycebeattie.com/files/tts/ : "Feel free to use these for any legal and ethical purpose." Publisher = speaker (Bryce Beattie). Suitable in principle; very small.
- en_US/john, en_US/norman, en_US/kristin, en_GB/cori (Bryce Beattie): "All recordings came from LibriVox.org."; "License: public domain"; 12.5 h / 15.5 h / 11.5 h / ~24 h; readers not named; permission not mentioned. Pending.
- en_US/joe (and kathleen): https://github.com/OHF-Voice/voice-datasets : "Crowdsourced text-to-speech voice datasets collected for Home Assistant's Year of Voice by Nabu Casa."; "These datasets are licensed under CC0 (public domain)."; "If you use them, please cite this repository!"; 27 first-name datasets in 15 locales; no contributor agreement or consent text on the page (documented absence). Publisher: Nabu Casa / Open Home Foundation. Pending (ask).
- en_US/hfc_female, hfc_male: Hi-Fi-CAPTAIN (NICT), "CC BY-NC-SA 4.0". Unsuitable.
- en_US/amy: dataset "https://github.com/MycroftAI/mimic3-voices", "See URL"; no licence column there. Pending/unclear.
- en_US/lessac: Blizzard 2013 (E6). Unsuitable. en_US/ryan: E7. en_US/ljspeech: D1. en_US/libritts, libritts_r: D3. en_US/arctic: E4. en_GB/vctk: E5. en_GB/jenny_dioco: E1.

### F. Programmes with express speaker authorization (effort-capped)

**F1. Kyutai Unmute Voice Donation Project (documented where stated).** https://huggingface.co/kyutai/tts-voices : "Voices of volunteers submitted through our Unmute Voice Donation Project, licensed as CC0."; other folders: Expresso "Non-commercial use only", VCTK CC BY 4.0, EARS "Non-commercial use only", voice-zero CC0. https://unmute.sh/voice-donation : "we did not publicly release voice cloning support." Terms and privacy exist only as PDFs (https://kyutai.org/legal/Terms%20of%20Use%20-%20Unmute%20Voice%20Donation%20Project%20v1.pdf and the matching Privacy Policy) that my tool could not parse. Search-index of those PDFs: contributors consent "by checking the consent boxes on the "Voice Donation" page and submitting your Voice Contribution"; donors choose whether the recording may "develop TTS models and/or to build a public open-source dataset"; removal requests honoured "by updating all the open-source datasets that we released on the Internet"; 228 verified voices of 374 submissions, June 2025 - February 2026. Inference: closest existing model of per-purpose express consent plus CC0; per-voice length unknown; verify the PDFs by hand before relying on them.

**F2. Effect AI Scripted Speech 1.0 - English (documented).** https://mozilladatacollective.com/datasets/cmkfm9fbl00nto0070sdcrak2 : "Creative Commons Zero v1.0 Universal (CC0-1.0)" (an Ethical Review line says CC-BY-4.0; conflict on page); "Contributors provided informed consent for their voice data to be used for research, model training" (sentence continues to public release); "It is forbidden to attempt to determine the identity of speakers in this dataset."; 10.2 h, 11,000+ sentences, multiple contributors; task TTS. Inference: consent to training is documented; consent to distributing a recognizable identity is not, and the identity ban cuts against it.

**F3. CLEAR Global TWB-voice (Kanuri) (documented).** https://huggingface.co/datasets/CLEAR-Global/TWB-voice-TTS-Kanuri-1.0-sampleset : "The dataset is released under CC BY-NC 4.0 after approval under the Dataset Access Terms."; "The speaker provided informed consent for data collection and open publishing"; "Speaker identity is anonymized - no attempts should be made to identify the individual"; "Do not use this data to create synthetic speech that could be used to impersonate the original speaker". Unsuitable (NC) but shows what an explicit no-impersonation clause looks like.

**F4. Academic consent framework (documented abstract).** Scott, Ashby, Braude, Aylett, "Who owns your voice? Ethically sourced voices for non-commercial TTS applications", CUI 2019, https://researchportal.hw.ac.uk/en/publications/who-owns-your-voice-ethically-sourced-voices-for-non-commercial-t/ : "We propose a multi-step informed consent process that more fully engages with TTS voice donors."

**F5. Mycroft / Open Voice OS / Neon AI / Coqui.** No contributor-consent voice dataset from OVOS or Neon AI was found; Neon's 2025 comparison page describes code licences only (search-index). Mycroft's Mimic Recording Studio repo contains no contributor terms (search-index). Kusal: not public (E10). Coqui "community voices": nothing found beyond Thorsten's own datasets.

**F6. Kielipankki "Donate Speech" (Finnish; search-index only).** Donated speech for "applications and services that are capable of interpreting and producing speech"; separate commercial-use licence; speakers may not be identified. Not read directly; not evaluated further.

**F7. Mozilla data-trust idea.** See B5: a community proposal for per-use permissions ("I allow my data to be used for TTS"); not implemented as far as any page I read states.

---

## 4. How express authorization could be obtained (practical, cited; not legal advice)

**LibriVox readers.**

- Route documented by LibriVox: register on the forum and send the reader a PM; the reader's forum name is printed on their reader page ("Forum name: Cori" on https://librivox.org/reader/92). Non-forum users can email info[AT]librivox[DOT]org, and admins pass messages "via private message on the LibriVox forum"; replies come back only if the reader wishes ("we will privately pass on your email address") (https://librivox.org/?p=31396).
- Keep to LibriVox etiquette: no unsolicited criticism of recordings (search-index of https://librivox.org/?p=31375).
- Precedent to cite in the request: NVIDIA's Hi-Fi TTS authors "sought the written consent of the speaker" before using a voice in a TTS application and "strongly encourage other developers to seek such consent" (https://ar5iv.labs.arxiv.org/html/2104.01497).
- Candidates with documented long-form corpora: the ten Hi-Fi TTS readers (A7), Linda Johnson (LJSpeech), and whichever readers underlie M-AILABS en_US/en_UK (names not documented; the dataset's own metadata would show them, which I did not download).
- Do not attempt to identify readers beyond their public reader-page name; handles such as "Sylviamb" and "LikeManyWaters" are the public names.

**Dataset publishers (documented contacts).**

- LJSpeech: kito@kito.us (https://keithito.com/LJ-Speech-Dataset/) - for provenance, not for Linda Johnson's consent, which Keith Ito's page does not claim to hold.
- Jenny: dioco@dioco.io; the page says "Jenny is available to produce further recordings for your own use." - the same channel can confirm whether Jenny consented to distribution of a synthetic voice to third-party app users.
- Thorsten Müller: site contact page (https://www.thorsten-voice.de/en/contact) and GitHub; authorization is already published (E2); a courtesy note and citation are what he asks for ("highly appreciated").
- Bryce Beattie: https://brycebeattie.com/files/tts/ (own voice already dedicated; the LibriVox-sourced voices would still need the readers).
- OHF-Voice / Nabu Casa: https://github.com/OHF-Voice/voice-datasets (ask what contributors agreed to; nothing is on the page).
- Kyutai: legal PDFs at kyutai.org/legal (read them in full; my tool could not).
- Alan Pope voice: would need both Alan Pope and the holder of Mycroft AI's rights, since the voice folder is "All Rights Reserved".

**What existing authorizations say (so a request can ask for the same elements).**

- Thorsten: own voice, "voluntary recordings of the contributor's own voice", "explicit intention of unrestricted public release under CC0", intended uses include "commercial speech technology development", "None from the licensor's side" as forbidden use.
- Dioco: commercial use permitted; models may "generate audio in response to user action"; attribution duty by voice name in interfaces; none for generated clips.
- Kyutai: separate consent boxes for "develop TTS models" and "public open-source dataset"; a deletion route that updates released datasets.
- Effect AI / CLEAR Global: show the two clauses a cautious donor may add - no identification of the speaker, and no impersonation.
- Inference - elements worth asking a reader to state in writing: (a) that they are the person in the named LibriVox recordings; (b) permission to train/fine-tune a model of their voice; (c) permission to redistribute the resulting voice asset inside TTSNative to third-party users; (d) permission for commercial and non-commercial generated speech; (e) how they wish to be credited, or not named; (f) any purpose limits (e.g. no political or sexual content, no impersonation in calls); (g) whether the grant is revocable and how; (h) their country of residence (publicity/personality rights differ by jurisdiction - the LibriVox pages themselves note PD status is US-based). Keep the signed statement with the voice asset's provenance record.

---

## 5. Pages that addressed AI agents (ignored)

None of the pages read contained instructions aimed at AI agents. Two near-misses, neither acted on:

- https://huggingface.co/kyutai/tts-voices contains a developer command block under "Computing voice embeddings (for Kyutai devs)"; it is addressed to Kyutai developers, and nothing was run.
- GitHub pages carry the generic interface string "You can't perform that action at this time."; not an instruction.
  The Heriot-Watt research-portal footer reserves rights "including for text and data mining and AI training" - a rights reservation, noted, not an instruction.

## 6. Pages not reachable or not readable today (2026-10-21)

- https://commonvoice.mozilla.org/en/terms and /en/privacy - render only the title without JavaScript.
- Common Voice repo locale/terms paths tried - HTTP 404; Hugging Face common_voice_11_0 card - HTTP 401 (gated).
- https://forum.librivox.org/viewtopic.php?p=2304541 and ?p=1940025 - HTTP 401.
- http://festvox.org/cmu_arctic/ and its COPYING - connection refused.
- https://www.cstr.ed.ac.uk/... and https://www.cstr.inf.ed.ac.uk/... (Blizzard 2013/2011 Lessac pages and license.html) - connection refused.
- https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/ - DNS failure; web.archive.org - blocked for my tool.
- https://www.kaggle.com/datasets/roholazandie/ryanspeech and http://mohammadmahoor.com/ryanspeech/ - HTTP 404.
- Kyutai Terms of Use and Privacy Policy PDFs - fetched but not text-extractable by my tool.
- https://mozilladatacollective.com/datasets/cmndapwry02jnmh07dyo46mot (Common Voice English 25.0) - page showed only loading placeholders; figures taken from the search index.
- https://librivox.org/pages/faq/ - returned navigation only.
