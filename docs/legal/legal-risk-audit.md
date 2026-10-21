# TTSNative legal risk and compliance audit

**Snapshot:** 20 October 2026, against `main` at `1ccdff5` plus pull requests #33 and #34.
**Prepared by:** the maintainer with an AI coding assistant, from the code, the build and release
workflows, the published website and public sources. **This is not legal advice.** It records what was
checked and why, so that a qualified attorney can review the open questions efficiently.

## 1. Summary

TTSNative is free, MIT-licensed software that people install and run on their own computers. The
publisher receives no documents, recordings, voices, generated audio or usage data. That distribution
model keeps most legal exposure with the person who chooses what to read, whose voice to copy and what
to do with the audio, but it does not remove it from the publisher entirely:

- **No issue found justifies disabling or removing a feature** while advice is obtained (see section 10).
- **Fixed in this review:** ONNX Runtime's default usage telemetry contradicted the "no telemetry"
  promise; document text could reach terminal logs; the consent statement and public notices were
  clarified; a release archive lacked the licence text; two dependency advisories (certifi, Vite).
- **Highest remaining exposure (low, medium if features or marketing drift):** Tennessee's ELVIS Act tool
  provision, the one replica law that clearly reaches a Tennessee publisher. The publisher's position is that
  cloning is optional, consent-gated, local and not marketed for imitating particular people.
- **Open questions for counsel:** whether EU AI Act Article 50(2) marking applies to free, non-commercial
  distribution; the provenance of some Kokoro voices; the ELVIS Act's "primary purpose or function"
  test for a general-purpose tool; trademark registrability of "TTSNative".

## 2. How responsibility divides

| Conduct                                                       | Who controls it | Notes                                                                                    |
| ------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Publishing the source code, website, releases and media       | Publisher       | Covered by the MIT licence and its warranty disclaimer; claims must be accurate          |
| Choosing which models the installer downloads, and from where | Publisher       | Pinned URLs and SHA-256 checksums; licences reviewed (section 6)                         |
| Designing Voice Studio and its consent step                   | Publisher       | Relevant to secondary-liability and "primary purpose" analyses                           |
| Selecting documents, recording or importing voices            | User            | Happens on the user's computer; nothing reaches the publisher                            |
| Deciding whose voice to clone; generating and exporting audio | User            | The consent statement records the user's undertaking; misuse is the user's act           |
| Publishing or distributing generated audio                    | User            | Copyright, publicity, deception and impersonation laws apply to the person who publishes |

Stating this division (as the README's Responsible use section now does) clarifies expectations; it
does not by itself release the publisher from liability for its own conduct.

## 3. Legal framework

Status tags: **[in force]**, **[enacted, not yet in force]**, **[proposed]**. Sources marked (S) were
confirmed only through secondary reporting; check them before relying on them.

### Tennessee ELVIS Act, Tenn. Code Ann. § 47-25-1101 et seq. [in force since 1 July 2024]

Pub. Ch. 588 (2024) extended Tennessee's Personal Rights Protection Act to voice, defined as "a sound in a
medium that is readily identifiable and attributable to a particular individual, regardless of whether
the sound contains the actual voice or a simulation of the voice" (§ 47-25-1102). Three civil causes of
action matter here (§ 47-25-1105(a)):

- **(a)(1) commercial use** of a voice for advertising or fundraising without consent;
- **(a)(2) publishing** an individual's voice or likeness to the public knowing it was not authorised by the
  individual (a parent or guardian for a minor; the executor or heirs for someone who has died);
- **(a)(3) tools:** distributing or making available "an algorithm, software, tool, or other technology …
  the primary purpose or function of which … is the production of a particular, identifiable individual's
  photograph, voice, or likeness", with knowledge that this was not authorised.

Remedies include injunctions, impoundment and destruction of infringing articles and the means of making
them, and actual damages and profits (§ 47-25-1106); unauthorised use is also a Class A misdemeanour
(§ 47-25-1105(b)), and whether that reaches (a)(3) is unsettled. Holders of exclusive recording contracts
(record labels) have standing (§ 47-25-1106(f)). Exemptions apply only to First-Amendment-protected uses
(§ 47-25-1107); there is no safe harbour for general-purpose tools. No court has interpreted (a)(3).

**Application.** This is the one replica law that clearly reaches the publisher, who lives in Tennessee.
Releasing the software "makes available" a tool. The strong position is that TTSNative's primary purpose is
reading documents with stock synthetic voices, and that Voice Studio is a general, consent-gated feature
that reproduces whatever voice the user supplies rather than "a particular, identifiable individual" chosen
by the publisher. A plaintiff could argue that each local voice is such a tool, or that cloning is "a"
primary function. Knowledge is required: the publisher never sees users' recordings, but exposure would
rise if he gave targeted help after specific notice of misuse, or if marketing invited cloning of other
people. Users who publish unauthorised clones are exposed under (a)(2).

### Other publicity and replica laws

- **California** Civ. Code § 3344 (voice in advertising) [in force]; § 3344.1 as amended by AB 1836, deceased
  personalities' digital replicas [in force 1 Jan 2025] (S). The California AI Transparency Act (Bus. & Prof.
  Code § 22757 et seq.) binds "covered providers" with over 1,000,000 monthly users [provider duties in force
  2 Aug 2026]; TTSNative is far below that.
- **New York** Civil Rights Law §§ 50–51 [in force]; _Lehrman v. Lovo_ (S.D.N.Y. 2025) (S) let voice actors'
  claims proceed against a commercial voice-cloning company. § 50-f covers deceased performers [in force].
- **Illinois** Right of Publicity Act as amended by P.A. 103-0836 [in force 1 Jan 2025]: § 30(d) reaches anyone
  who "materially contributes to, induces, or otherwise facilitates" an unauthorised replica "after having
  obtained actual knowledge" of a specific infringement.
- **Federal NO FAKES Act** (S. 4591 / H.R. 8915) [proposed; reported by Senate Judiciary 24 June 2026, not
  passed]: tool liability only for products "primarily designed" to replicate a specifically identified
  individual without authorisation, with limited other purpose, or marketed for that.
- **TAKE IT DOWN Act**, Pub. L. 119-12 [in force]: visual intimate imagery and user-content platforms only; not
  applicable to a local audio tool.

### FTC Act and impersonation

- **FTC Act § 5** (15 U.S.C. § 45) [in force] reaches deceptive claims, including by individuals; the
  realistic exposure is the publisher's own claims ("no telemetry", "nothing leaves your computer"), which
  must be literally true. Tennessee's Consumer Protection Act (§ 47-18-104) is the state parallel.
- **Impersonation Rule**, 16 CFR Part 461 [in force 1 April 2024] covers impersonating governments and
  businesses. The 2024 proposal to extend it to individuals and to "means and instrumentalities" providers
  is pending; the FTC said in December 2024 it would not proceed with the means-and-instrumentalities
  provision "at this time", and in December 2025 set aside the _Rytr_ order that rested on that theory.

### Copyright and secondary liability

There is no copyright in a voice as such. For tool providers: _Sony v. Universal_, 464 U.S. 417 (1984)
(substantial non-infringing uses); _MGM v. Grokster_, 545 U.S. 913 (2005) (inducement); and _Cox
Communications v. Sony Music_, No. 24-171 (U.S. 25 Mar 2026): contributory liability requires intent, shown
only by inducement or a service "tailored to that infringement". Private listening is not a public
performance; sharing narrations of copyrighted books would likely infringe and is user conduct. DMCA § 1201
matters only for DRM circumvention, which TTSNative does not do (encrypted archives are refused).

### Biometric privacy

- **Illinois BIPA** (740 ILCS 14) [in force] regulates private entities that "collect, capture … or otherwise
  obtain" or are "in possession of" voiceprints. _Barnett v. Apple_ (Ill. App. 2022) and _G.T. v. Samsung_
  (7th Cir. Aug. 2026) (S) hold that data kept on the user's device, which the supplier does not control, is
  outside BIPA. Whether a speaker embedding used for synthesis is a "voiceprint" is unsettled.
- **Texas CUBI** (excluding AI uses after TRAIGA, in force 1 Jan 2026) and **Washington RCW 19.375** (audio
  excluded) do not apply; Washington's My Health My Data Act needs a regulated entity that processes data.

### Warranties, product liability and privacy-law thresholds

- The MIT licence's conspicuous "AS IS" disclaimer satisfies Tenn. Code § 47-2-316(2)–(3) if Article 2 applies
  at all to a free download; it cannot bind third parties or excuse intentional misconduct.
- Free, intangible software is likely outside the Tennessee Products Liability Act (§ 29-28-102).
- **EU Product Liability Directive** (EU) 2024/2853 [enacted, transposition by 9 Dec 2026] excludes free and
  open-source software "developed or supplied outside the course of a commercial activity" (Art. 2(2)).
- Tennessee Information Protection Act (in force 1 July 2025) and the CCPA have revenue and volume thresholds
  far above this project.

### EU AI Act (Regulation (EU) 2024/1689)

- **Article 50(2)** [applies from 2 Aug 2026]: providers of systems generating synthetic audio must ensure
  outputs are "marked in a machine-readable format and detectable as artificially generated". The Digital
  Omnibus on AI (Regulation (EU) 2026/1744) gives systems placed on the market before 2 Aug 2026 until
  2 Dec 2026. A voluntary Code of Practice on marking and labelling (10 June 2026) favours layered marking.
- **Article 2(12)** exempts free and open-source systems except, among others, Article 50 systems "placed on
  the market or put into service". "Making available" needs a commercial activity (Art. 3(10), Recital 103:
  open repositories are not in themselves monetisation); "putting into service" (Art. 3(11)) has no such
  qualifier. Purely personal users are not "deployers" (Art. 2(10), 3(4)). **Whether a free, non-monetised
  hobby release makes the publisher a "provider" is genuinely unsettled.**
- **Article 50(4)**: deployers (professional users) must disclose deep fakes.
- **New Article 5(1)(ba)** [applies from 2 Dec 2026]: prohibits systems that generate realistic sexual
  material of an identifiable person without consent, where that is foreseeable and reproducible and the
  system lacks "reasonable and adequate" safeguards (Art. 5(1a)); the open-source exemption does not apply.
  Whether a cloned voice reading explicit text is "audio … of an identifiable natural person engaged in
  sexually explicit activities" is unsettled.
- Enforcement against a U.S. individual is difficult; practical consequences would more likely come through
  platforms (GitHub, Hugging Face) or reputation.

### GDPR and UK

GDPR does not apply to users' purely personal or household activity (Art. 2(2)(c)); a developer who receives
no personal data does not determine the purposes and means of processing and is not a controller for it.
Mere accessibility of a website in the EU does not establish targeting (Recital 23). GitHub logs visitors' IP
addresses on Pages sites under its own privacy statement; a short notice is good practice rather than
clearly required. In the UK, the same household analysis applies; the Online Safety Act covers user-to-user
services, not a local app; the 2025–2026 deepfake offences concern intimate images, not audio.

### Trademark

Rights arise from use, including free software distribution (_Planetary Motion v. Techsplosion_, 261 F.3d 1188
(11th Cir. 2001)). The MIT licence grants copyright permissions and says nothing about marks; using the logo
as a source identifier can still infringe if it confuses, and licensing a mark to everyone without quality
control risks weakening it.

## 4. Risk matrix

| #   | Risk                                                       | Level after this review                     | Action                                    |
| --- | ---------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| R1  | ELVIS Act tool provision (§ 47-25-1105(a)(3))              | Low (Medium if marketing or features drift) | Keep design and wording general; counsel  |
| R2  | Users' unauthorised clones (ELVIS (a)(2), CA, NY, IL)      | Low for the publisher                       | Consent wording, Responsible use (done)   |
| R3  | EU AI Act Art. 50(2) marking of synthetic audio            | Low–Medium, unsettled                       | Decision: neutral metadata tag; counsel   |
| R4  | EU AI Act new Art. 5(1)(ba) (from 2 Dec 2026)              | Low–Medium, unsettled                       | Decision; counsel                         |
| R5  | Accuracy of privacy claims (FTC Act § 5, Tenn. CPA)        | Was Medium; now Low                         | Fixed (telemetry, disclosures)            |
| R6  | Document text in logs                                      | Was Low–Medium; now Low                     | Fixed                                     |
| R7  | Provenance of some Kokoro voices                           | Low–Medium, unresolved                      | Decision; counsel                         |
| R8  | Trademark registrability and brand control                 | Low–Medium (brand, not liability)           | Decision: clearance; optional notice      |
| R9  | Copyright in user content and outputs; secondary liability | Low                                         | Responsible use (done)                    |
| R10 | Biometric privacy (BIPA, CUBI, Washington)                 | Low                                         | Keep everything local                     |
| R11 | Licence compliance of dependencies and releases            | Low                                         | LICENSE in web UI archive (done)          |
| R12 | Warranty and product liability                             | Low                                         | None needed                               |
| R13 | Website personal data (GitHub Pages logs)                  | Low                                         | Notice added (done)                       |
| R14 | Harm from malicious files, supply chain or LAN exposure    | Low                                         | Existing safeguards; two advisories fixed |

**R1. ELVIS Act tool provision.**

1. Risk: being sued as the distributor of a tool whose "primary purpose or function" is producing a particular,
   identifiable person's voice without authorisation.
2. Authority: Tenn. Code Ann. § 47-25-1105(a)(3), § 47-25-1106.
3. Involved: Voice Studio (`apps/web/src/features/studio`, `apps/server/src/ltts/voices`), the Chatterbox
   engine, releases and the website's description of cloning.
4. How: a label or estate whose artist's voice a user cloned names the publisher alongside the user, arguing
   that the cloning feature is a tool for producing that person's voice.
5. Existing safeguards: cloning is optional and installed separately; it only copies a recording the user
   supplies; consent is enforced by the API and recorded; no real person's voice ships, is named or is
   marketed; Chatterbox watermarks its output.
6. Remaining: no case law on "primary purpose"; defence costs and injunction risk even for a strong case.
7. Mitigation: keep the product described as a reader with an optional voice feature for your own or
   permitted voices; never name or demo real people without written permission; don't add sharing of voice
   profiles; respond to specific misuse reports without assisting the reported use. Consent wording now
   tracks the statute's consent-givers (minor's parent or guardian, deceased person's estate).
8. Counsel: yes, question 1.

**R2. Users publishing unauthorised clones.**

1. Risk: users publishing or advertising with a cloned voice; the publisher named as contributor.
2. Authority: ELVIS § 47-25-1105(a)(1)–(2); Cal. Civ. Code §§ 3344, 3344.1; N.Y. Civ. Rights Law §§ 50–51, 50-f;
   765 ILCS 1075 § 30(b), (d).
3. Involved: exported audio (user conduct).
4. How: a user publishes a clone of a real person; Illinois § 30(d) could reach someone who keeps helping after
   actual knowledge of that specific infringement.
5. Existing: consent statement; local-only processing (no knowledge, no control); watermark on cloned audio.
6. Remaining: low; mostly defence costs if named.
7. Mitigation: done (Responsible use section and FAQ; a channel for reporting misuse the project can act on).
8. Counsel: only if a claim or specific notice arrives.

**R3. EU AI Act Article 50(2) marking.**

1. Risk: synthetic audio from TTSNative is not machine-readably marked (Kokoro output carries no mark;
   Chatterbox output carries Perth).
2. Authority: Regulation (EU) 2024/1689 Art. 50(2), 2(12), 3(3), 3(10)–(11); Regulation (EU) 2026/1744.
3. Involved: `apps/server/src/ltts/exports`, synthesis output.
4. How: an EU regulator treats a public, branded open-source release used by professionals in the EU as
   "putting into service".
5. Existing: Chatterbox watermark; free, non-monetised distribution; no EU targeting.
6. Remaining: unsettled scope; enforcement against a U.S. individual is unlikely, platform pressure possible.
7. Mitigation (needs approval): add a neutral, unbranded machine-readable "AI-generated" metadata flag to
   exported files, which is cheap and keeps exports free of TTSNative branding; applying Perth to Kokoro
   output would add a heavy dependency and is not proposed.
8. Counsel: yes, question 2.

**R4. EU AI Act new Article 5(1)(ba).**

1. Risk: from 2 Dec 2026, systems that can foreseeably produce realistic sexual audio of an identifiable
   person without consent, lacking adequate safeguards, are prohibited, open source included.
2. Authority: Art. 5(1)(ba) and 5(1a) as added by Regulation (EU) 2026/1744; Recital 12.
3. Involved: Voice Studio plus free-text narration.
4. How: a user clones someone and has the voice read explicit text.
5. Existing: consent gate and record; no sharing of profiles; watermark; misuse reporting channel.
6. Remaining: unsettled whether audio of that kind is in scope and whether the publisher is a provider.
7. Mitigation (needs approval, not implemented): a filter on explicit text when a cloned voice is used. It
   would read users' local text and restrict a general reader, which conflicts with the project's no-
   monitoring design, so it is recorded as an option for counsel rather than added.
8. Counsel: yes, question 2.

**R5. Accuracy of privacy claims.** Authority: FTC Act § 5; Tenn. Code § 47-18-104. Finding: official ONNX
Runtime builds send usage telemetry by default (Microsoft's `docs/Privacy.md`) and TTSNative did not switch
it off, so "no telemetry" was not true by default. Fixed: telemetry is switched off before Kokoro loads
(`apps/server/src/ltts/onnx.py`, tested); README and website now name the download hosts and say they see IP
addresses; the website explains online browser voices and GitHub's logs. Counsel: optional review of the
"local-only" wording.

**R6. Document text in logs.** Authority: the project's own privacy promise; FTC Act § 5 as above.
Finding: kokoro-onnx error messages quote the passage and were logged in full. Fixed in
`engines/kokoro.py`, `errors.py`, `logging_setup.py`, with tests. Logs never go to a file.

**R7. Provenance of some Kokoro voices.** Kokoro-82M's model card states that part of its training audio was
synthetic output of "closed TTS models from large providers", and voice names match OpenAI's (Alloy, Echo,
Fable, Nova, Onyx, Sky) and Google's (Aoede, Kore, Puck, Fenrir). Possible issues (the model author's
compliance with those providers' terms; a claim that a voice imitates a provider's voice actor) sit first with
the model's author; TTSNative uses the weights under Apache-2.0 and does not present any voice as a real
person. Options: keep (current), hide those voices by default, or take counsel's view. Counsel: question 3.

**R8. Trademark.** See section 7. No conflicts found; registrability as a word mark is uncertain. Options:
professional clearance; ™ usage; an optional `brand/README.md` note that the MIT licence covers copying the
files, not using the name and logo to identify another product (needs approval because it is legally
significant). Counsel: question 4.

**R9. Copyright.** Private reading is the intended use; publishing narrations of others' works is the user's
responsibility (now said plainly, without in-app warnings). Under _Cox_ (2026), contributory liability needs
inducement or a tool tailored to infringement; TTSNative is neither.

**R10. Biometric privacy.** Recordings and speaker embeddings stay on the user's machine under the user's
control; _Barnett_ and _G.T. v. Samsung_ (S) place that outside BIPA for the publisher. Keep it that way: no
cloud sync, crash uploads or hosted cloning demo without a fresh review.

**R11. Licences.** See section 6. The source and web UI archives contain no GPL or LGPL code; the web UI
archive includes `LICENSE`. The Windows installer (2026-10-21) does redistribute espeak-ng and phonemizer
(GPL-3.0) and libsndfile, LAME, mpg123 and libiconv (LGPL-2.1), unmodified: it ships their licences in
`THIRD-PARTY-NOTICES.txt` and `licenses/`, and each release attaches their corresponding source. Whether
the server process and these GPL libraries form one combined work is unsettled (the FSF's view against
"mere aggregation"); complying as if they do costs little, since everything in that process is
GPL-3.0-compatible, and TTSNative's own code stays MIT either way. Worth confirming with counsel (section 11).

**R12. Warranty and product liability.** MIT's conspicuous disclaimer; free intangible software outside the
Tennessee Products Liability Act; the EU Product Liability Directive excludes non-commercial open source.

**R13. Website.** No cookies, analytics or third-party requests (verified by recording every request); the
privacy note now covers GitHub's IP logs and online browser voices.

**R14. Security.** Sandboxed document parsing, zip-bomb and traversal checks, pinned and verified downloads,
loopback-only server with Host, CSRF and token protections, plain-HTTP LAN mode documented. This review fixed
certifi (GHSA-6q48-6c7w-9gw2, #33) and Vite (GHSA-698v-4r3x-3vcv, #34).

## 5. Verified existing protections

Checked in the code on 20 October 2026 (file paths are in this repository):

- **Consent is enforced by the server, not only the interface.** Both ways of creating a voice
  (`VoiceProfileService.create` and `create_studio` in `apps/server/src/ltts/voices/profiles.py`) call
  `_check_can_create`, which refuses a request without `consent=true` (`consent_required`), whatever
  client sends it. The exact statement and the time of confirmation are stored with each voice. A
  determined user can of course send `consent=true` to their own local server; the boundary is an
  explicit undertaking, not identity verification, which local software cannot perform.
- **No built-in imitation of particular people.** Custom voices exist only when a user supplies a
  recording. The cloned voice in the demo video is made from a built-in synthetic Kokoro voice, and the
  video says so. Shipped sample text is public domain ("A Scandal in Bohemia") or written for the project.
- **Studio auditions before consent** use two fixed sentences (`AUDITION_TEXTS` in `voices/studio.py`);
  nothing can be narrated or exported with the voice until consent creates it.
- **Chatterbox watermark.** Chatterbox's own `generate()` applies Resemble AI's Perth watermark
  (`chatterbox/tts_turbo.py`), and the worker only calls that method; TTSNative does not strip it. Its
  survival through MP3 export was not tested in this review. Kokoro output is not watermarked.
- **Local only.** The server binds to `127.0.0.1`; network mode needs `--allow-network` and a token of at
  least 24 characters, compared in constant time; Host-header checks block DNS rebinding;
  state-changing requests need a custom header and `Sec-Fetch-Site` checks block cross-site requests; a
  strict Content-Security-Policy is set (`apps/server/src/ltts/security.py`). LAN mode is plain HTTP, as
  `docs/guides/lan-access.md` warns.
- **Untrusted files.** Documents are parsed in a sandboxed child process with memory and time limits,
  archives are checked for zip bombs and path traversal, and only an exception type crosses back to the
  server (`documents/sandbox.py`, `documents/safezip.py`).
- **Supply chain.** Model files come from pinned URLs on approved hosts with SHA-256 checks before use
  and before every load; uv is downloaded with a pinned checksum; lockfiles are exact; npm and uv apply a
  14-day release cool-down; npm install scripts are disabled; GitHub Actions are pinned to commit SHAs;
  releases carry SBOMs, checksums and signed build provenance.
- **Deletion.** Deleting a voice removes its folder (recording, studio session and built voice), its
  database row and its cached audio (`VoiceProfileService.delete`).
- **No analytics or accounts** in the app or the website; the Chatterbox worker runs Hugging Face and
  Transformers offline with their telemetry disabled.

## 6. Licences

| Component                                    | Licence                       | How it reaches users                                     | Status                                                                                        |
| -------------------------------------------- | ----------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TTSNative source, brand files, website       | MIT                           | Repository, source archive, Pages                        | LICENSE in the repository and source archive; now also in the web UI archive                  |
| Bundled npm packages and fonts in the web UI | MIT, ISC, Apache-2.0, OFL-1.1 | Prebuilt `web-ui` archive and the app                    | `THIRD-PARTY-LICENSES.md` and `FONT-LICENSES.txt` written by the build                        |
| Inter font on the website                    | OFL-1.1                       | Pages                                                    | `site/fonts/OFL-Inter.txt` ships beside it                                                    |
| Python runtime packages                      | Mostly permissive             | Source installs: the user's uv. Windows installer        | Generated inventory; release SBOMs; the installer's `THIRD-PARTY-NOTICES.txt`                 |
| phonemizer, espeak-ng (in espeakng-loader)   | GPL-3.0(-or-later)            | PyPI (source installs); bundled in the Windows installer | Licence texts and notices shipped; corresponding source attached to each release              |
| libsndfile, mpg123, LAME (in soundfile)      | LGPL-2.1                      | Same                                                     | Dynamically loaded, unmodified, replaceable; licence shipped; source attached to each release |
| certifi                                      | MPL-2.0                       | Same                                                     | Unmodified; its licence ships with it                                                         |
| Kokoro-82M weights and voices                | Apache-2.0                    | Bundled in the installer; source installs download it    | Apache-2.0 text and attribution (incl. Koniwa, SIWIS) in the installer's `licenses/kokoro`    |
| Chatterbox Turbo code and weights            | MIT                           | Downloaded by the user from Hugging Face                 | Credited; watermark preserved                                                                 |
| Videos, screenshots, voice samples           | MIT (project media)           | Repository, releases, website                            | Generated by the app with synthetic voices; music synthesised by the project's own script     |

**Distribution, not use, triggers copyleft duties.** The source and web UI archives contain no GPL or
LGPL code; source users install those packages themselves from PyPI. The Windows installer is a bundled
build, so it carries the GPL-3.0 and LGPL obligations: licence texts and notices in every installer, and
the corresponding source attached to every release that offers it (see
`docs/security/license-inventory.md`).

**Provenance questions that permissive weights do not settle.** Kokoro's model card says part of its
training audio was "synthetic audio generated by closed TTS models from large providers". Several Kokoro
voice names match commercial voices exactly (OpenAI: Alloy, Echo, Fable, Nova, Onyx and Sky; Google
Gemini: Aoede, Kore, Puck and Fenrir), which suggests where that audio came from. Any breach of those
providers' terms would be a matter between them and the model's author, and AI-generated audio has
limited copyright protection, but a claim that a voice imitates the person behind a provider's voice
cannot be ruled out. This is unresolved, not established.

## 7. Trademark (preliminary search)

A non-professional knockout search on 20 October 2026 (USPTO index to 14 October 2026; app stores, GitHub,
PyPI, npm, domains) found **no identical or confusingly similar registered marks**. The closest names in
use, all unregistered, are the "NativeSpeech" pronunciation app, a delisted "NativeVoice: Offline TTS"
Android app and a 2019 "NativeTTS" demo repository. The larger issue is **registrability**: the USPTO has
treated "TTS" as descriptive or generic (TTS.AI refusal, June 2026), and "native TTS" is a common developer
phrase for on-device speech, so a word-mark application could be refused as descriptive. No similar
registered "N made of vertical bars" logo was found, but no image or design-code search was done, and the
Tennessee register could not be searched (its search requires a human verification step).

The MIT licence on the brand files is a copyright licence; it does not grant trademark rights, which
arise from use of the name and logo as a brand. Professional clearance is recommended before any
registration, paid offering or wider marketing.

## 8. Privacy and biometric data

| Data                                         | Where it is                                                         | Leaves the computer?                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Documents and extracted text                 | `data/` (library database, uploads)                                 | No. In opt-in LAN mode, served to the user's own devices on the network                 |
| Voice recordings, studio takes, built voices | `data/voices/` (WAV, FLAC, safetensors)                             | No                                                                                      |
| Generated audio                              | `data/` audio cache; exports where the user saves them              | No, unless the user shares it                                                           |
| Logs                                         | Terminal only; never written to a file                              | Only if the user copies them; they now carry identifiers and counts, not document text  |
| Model and package downloads                  | GitHub, Hugging Face, PyPI, npm, Astral (uv)                        | The requests reveal the user's IP address to those hosts, as any download does          |
| Third-party telemetry                        | ONNX Runtime (now off), Hugging Face and Transformers (off/offline) | No, after this review                                                                   |
| Website visitors                             | GitHub Pages server logs                                            | GitHub logs IP addresses; the site sets no cookies and loads nothing from third parties |

**The publisher processes no personal data from the app.** Voice recordings and speaker embeddings are
biometric-like data, but they are created, stored and deleted by the user on their own machine; the
publisher never collects, possesses or receives them. Section 3 explains why this keeps biometric privacy
statutes aimed at entities that collect such data from applying to the publisher. A privacy notice for
the app itself is therefore not needed; the website's short "This website" note now covers the only
personal data flow the publisher's site involves, GitHub's hosting logs.

## 9. Copyrighted input and generated output

Reading a lawfully obtained document aloud for oneself is the core, legitimate use and is not restricted.
Distributing or publishing narration of someone else's copyrighted text (for example, an audiobook of a
novel) is a separate act that may need the rights holder's permission; that is the user's decision and
responsibility, and the Responsible use section says so without warnings in the app. TTSNative has
substantial non-infringing uses, does not encourage infringement, and keeps no copies of user content
anywhere but the user's computer (section 3 discusses secondary liability).

## 10. Is any feature worth disabling while advice is obtained?

**No.** The evidence does not support disabling Voice Studio, Kokoro voices, export or the website demo:

- Voice cloning is optional, off until the user installs a separate engine, consent-gated by the server,
  limited to recordings the user supplies, watermarked by Chatterbox, and not marketed for imitating
  anyone. That is the profile of a general-purpose tool, not one whose primary purpose is reproducing a
  particular person's voice.
- No built-in voice is presented as, or named after, a real person. The provider-named Kokoro voices are
  an open provenance question to raise with counsel, not evidence of a current claim.
- The website demo uses the visitor's own browser voices and says so.

If counsel concludes that EU AI Act Article 50(2) applies to the project, a neutral machine-readable
"AI-generated" tag on exports would be a proportionate response that keeps exports free of branding.

## 11. Questions for a qualified attorney (most material first)

1. **Tennessee ELVIS Act (§ 47-25-1105(a)(3)).** Does a general, consent-gated, local voice-cloning feature in a
   document reader have the "primary purpose or function" of producing "a particular, identifiable
   individual's" voice? Does the § 1105(b) misdemeanour reach (a)(3)? Are the consent wording and the
   locally stored consent record adequate evidence of good faith? How should specific misuse reports be
   handled?
2. **EU AI Act.** Is a free, non-monetised hobby release "placing on the market" or "putting into service",
   making the publisher a provider under Article 50(2)? Does reading text aloud fall within the Article 50(2)
   exception? Would a neutral metadata flag on exports be adequate marking? Is there exposure under the new
   Article 5(1)(ba) from 2 December 2026, and are consent and a misuse-reporting channel "reasonable and
   adequate" safeguards for open-source, local software?
3. **Kokoro voice provenance.** Do the provider-named voices (Alloy, Echo, Fable, Nova, Onyx, Sky; Aoede,
   Kore, Puck, Fenrir) create any publicity or contractual exposure for a downstream distributor of the
   Apache-2.0 weights, and should they be hidden by default?
4. **Trademark.** Professional clearance of "TTSNative" and the logo (including the Tennessee register and
   common-law use); word versus logo mark given the descriptiveness risk; whether logo files already
   released under MIT need a notice to avoid weakening the mark.
5. **Privacy wording.** A quick review of the "local-only" and "no telemetry" statements now in the README,
   website and app.

## 12. Sources

Retrieved 20 October 2026. (S) = secondary source; (NR) = well-known authority not re-checked in this review.

- Tennessee Pub. Ch. 588 (2024), the ELVIS Act: https://publications.tnsosfiles.com/acts/113/pub/pc0588.pdf ;
  Tenn. Code Ann. § 47-25-1105 (FindLaw mirror):
  https://codes.findlaw.com/tn/title-47-commercial-instruments-and-transactions/tn-code-sect-47-25-1105/
- Tenn. Code Ann. § 47-2-316:
  https://codes.findlaw.com/tn/title-47-commercial-instruments-and-transactions/tn-code-sect-47-2-316/ ;
  § 29-28-102: https://codes.findlaw.com/tn/title-29-remedies-and-special-proceedings/tn-code-sect-29-28-102/
- California Bus. & Prof. Code § 22757.1 and § 22757.3.2:
  https://california.public.law/codes/ca_bus_and_prof_code_section_22757.1 ,
  https://california.public.law/codes/ca_bus_and_prof_code_section_22757.3.2 ; AB 1836 summary (S):
  https://www.manatt.com/insights/newsletters/client-alert/california-enacts-a-host-of-new-ai-and-digital-rep
- New York Civil Rights Law § 50-f: https://www.nysenate.gov/legislation/laws/CVR/50-F ; _Lehrman v. Lovo_ (S):
  https://www.loeb.com/en/insights/publications/2025/07/lehrman-v-lovo-inc
- Illinois P.A. 103-0836: https://ilga.gov/Legislation/publicacts/view/103-0836 ; BIPA (740 ILCS 14):
  https://ilga.gov/Legislation/ILCS/Articles?ActID=3004&ChapterID=57
- NO FAKES Act, S. 4591 (reported): https://www.govinfo.gov/content/pkg/BILLS-119s4591rs/html/BILLS-119s4591rs.htm
- TAKE IT DOWN Act, Pub. L. 119-12: https://www.govinfo.gov/content/pkg/PLAW-119publ12/html/PLAW-119publ12.htm
- FTC Impersonation Rule: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-461 ; hearing
  notice (means and instrumentalities):
  https://www.ftc.gov/system/files/ftc_gov/pdf/r207000_impersonation_rule_hrg_signed.pdf ; _Rytr_ set-aside:
  https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-reopens-sets-aside-rytr-final-order-response-trump-administrations-ai-action-plan
- _Cox Communications v. Sony Music_, No. 24-171 (U.S. 2026): https://www.supremecourt.gov/opinions/25pdf/24-171_bq7d.pdf ;
  _Sony v. Universal_, 464 U.S. 417 (1984) (NR); _MGM v. Grokster_, 545 U.S. 913 (2005) (NR)
- _Barnett v. Apple_, 2022 IL App (1st) 220187:
  https://www.law.berkeley.edu/wp-content/uploads/2025/03/01-Barnett-v-Apple-Inc.pdf ; _G.T. v. Samsung_ (S):
  https://www.mayerbrown.com/en/insights/publications/2026/08/seventh-circuit-holds-that-bipa-does-not-reach-biometric-data-that-remains-on-a-users-device
- Texas HB 149 (TRAIGA): https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm ; Washington RCW 19.375:
  https://app.leg.wa.gov/RCW/default.aspx?cite=19.375.010
- EU AI Act, Regulation (EU) 2024/1689: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689 ;
  Digital Omnibus on AI, Regulation (EU) 2026/1744: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202601744 ;
  Code of Practice on AI-generated content: https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- EU Product Liability Directive (EU) 2024/2853: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402853
- UK Data (Use and Access) Act 2025 s.138: https://www.legislation.gov.uk/ukpga/2025/18/section/138
- _Planetary Motion v. Techsplosion_, 261 F.3d 1188 (11th Cir. 2001):
  https://media.ca11.uscourts.gov/opinions/pub/files/200010872.OPN.pdf
- GitHub Pages and visitor IP logging: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages ;
  GitHub General Privacy Statement: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- MDN, `SpeechSynthesisVoice.localService`: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService
- ONNX Runtime privacy and telemetry: https://github.com/microsoft/onnxruntime/blob/main/docs/Privacy.md
- Kokoro-82M model card (licence, training data, CC BY credits): https://huggingface.co/hexgrad/Kokoro-82M
- Chatterbox (Perth watermark): https://github.com/resemble-ai/chatterbox
- Trademark search (USPTO TSDR records cited in section 7, searched 20 October 2026), e.g. TTS.AI office action:
  https://tsdr.uspto.gov/statusview/sn99662592

## 13. Limitations

This review read the code, workflows and published site and ran the tests listed in pull requests #33 and
#34. It did not test the Chatterbox watermark after MP3 export, run a professional trademark search,
search the Tennessee trademark register, or examine every transitive dependency's licence text by hand
(the generated inventory and SBOMs list them). Laws change; re-check the framework before relying on it.
