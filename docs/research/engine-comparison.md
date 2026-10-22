# Open speech engines compared for studio voices

> **In short:** Keep Chatterbox Turbo as the studio engine for now. No open engine has published
> evidence that 30 minutes of one person beats a good 15-second clone, and the open models we found
> ranked above Turbo in an independent listening arena have non-commercial or custom licences.
> Studies of speaker adaptation agree on one pattern. A small fine-tune (LoRA, or a few layers) on
> tens of minutes gives a modest gain, heard mostly in prosody and sentence endings. Full fine-tunes
> on small data often make words less clear. The most promising next step is a LoRA on Turbo's T3,
> trained on the session. The one second engine worth testing against it is VoxCPM2: Apache-2.0
> code and weights, official LoRA, 48 kHz output. Neither should replace a voice without a blind
> listening test.

Research date: 2026-10-21. Pages were only read: GitHub READMEs and LICENSE files, Hugging Face
model cards and file listings, and arXiv papers. Some of the reading was done by research helpers
working under the same rules. Every page went through a fetch tool that summarises, so check
exact wording on the page before quoting it. Nothing was downloaded, installed or run. Star counts
and dates are as seen on that day. Labels: **documented** (read on the cited page), **claimed** (an
author's own claim, or an anecdote) and **inference** (our reasoning). Licence notes repeat what the
pages say; they are not legal advice.

## The answer

1. **Should Turbo stay the main studio engine?** Yes.
   - Its code and weights are MIT, it is integrated and measured
     ([voice-quality.md](voice-quality.md)), it needs about 4 GB of VRAM (our install note), runs on
     CPU (slowly) and watermarks its output. No engine with licences as clean has shown that it
     copies a given person better.
   - On the independent [Artificial Analysis arena](https://artificialanalysis.ai/text-to-speech/leaderboard)
     (documented), Chatterbox (model unstated) has Elo 1024: above Zonos v0.1 (1000), OpenVoice v2
     and VibeVoice-1.5B (956). The engines here that rank above it all have non-commercial or
     restrictive licences: Fish Audio Drama 3 Preview (1248), Fish S2 Pro (1112), Higgs Audio v3
     and OpenAudio S1-mini (1044). CosyVoice, IndexTTS, GPT-SoVITS, Orpheus, CSM and Dia were not
     listed; VoxCPM, dots.tts, Qwen3-TTS and Kokoro were not looked up. Arena votes judge general
     speech quality, not how well one particular person is copied.
2. **What would most improve "30 minutes beats 15 seconds":**
   - **Train a small adapter on the session.** Turbo's inflection comes from T3, and published
     adaptation gains show up mostly in prosody, so a T3 LoRA is the closest match. It adds no
     engine, keeps the MIT weights and uses an Apache-2.0 toolkit. A fork reports training in under
     12 GB at batch 2, so it should fit a 10 GB GPU (inference). It leaves S3Gen, which makes the
     timbre, on its 10 s prompt and the averaged x-vector.
   - **If listeners say the gap is timbre rather than delivery, test VoxCPM.** Its official LoRA
     also trains the diffusion decoder ("essential for voice quality" per its docs), and it outputs
     44.1 or 48 kHz against Turbo's 24 kHz. Training needs about 12 GB (VoxCPM 1.5) or 20 GB
     (VoxCPM2) of VRAM at the documented batch size.
   - **Measure against the real voice:** hold back passages from training and compare with their
     real recordings, blind (plan below).
3. **What not to expect:** published gains are modest (speaker similarity +0.01 to +0.09, listener
   scores +0.3 to +0.4 on a 5-point scale), and similarity scores level off: in the Seed-TTS paper,
   human recordings scored below the model's clones. Thirty minutes is more likely to make the voice
   speak more like the person than to make it sound like a different product.

## What the evidence says about 30 minutes versus a short prompt

| Study (who measured)                                                                   | Model                         | Speaker data                                                                    | Zero-shot → adapted                                                                                                                          | Note                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Seed-TTS](https://arxiv.org/html/2406.02430v1) §3.2 (authors; model not released)     | Seed-TTS                      | 1–10 h each, 5 speakers, against a 20 s prompt                                  | WER 3.15 → 2.83, similarity 0.779 → 0.789, CMOS +0.37                                                                                        | Authors: the fine-tune "captures more nuances" (prosody, endings) |
| [CosyVoice 2](https://arxiv.org/html/2412.10117) Table 11 (authors)                    | CosyVoice 2                   | One in-house speaker; "as few as 400 audio recordings" suffice                  | Similarity 0.721 → 0.795, naturalness 3.91 → 3.96, WER 5.34 → 7.15                                                                           | Words got less clear; extra losses brought WER back to 6.64       |
| [CSP-FT](https://arxiv.org/html/2501.14273) Tables 2–3 (authors, 15 listeners)         | Fun-CosyVoice3                | 244 h over 2,060 speakers (about 7 min each, inference)                         | Full fine-tune: SS 91.2 → 94.5, WER 4.0 → 12.1, SMOS 3.95 → 4.28, NMOS 4.35 → 3.45. Two layers (8 %): SS 94.8, WER 3.8, SMOS 4.35, NMOS 4.40 | Full fine-tune lost naturalness; partial fine-tune didn't         |
| [Singlish TTS](https://arxiv.org/html/2607.23027) Table V (independent academic group) | Chatterbox (variant unstated) | About 0.7 h of training audio per speaker, 50 speakers, T3 only, full fine-tune | Speaker match 0.604 → 0.695 (seen), 0.536 → 0.606 (held out); WER 11.5 → 15.4; predicted MOS 3.34 → 2.75                                     | Accent adaptation, not one voice                                  |
| [Mega-TTS 2](https://arxiv.org/html/2307.07218v4) Table 1 (authors, 2023)              | Mega-TTS 2                    | Prompts of 3, 60 and 300 s; fine-tunes on 10, 60 and 300 s                      | Prompt: 0.898, 0.926, 0.932. Fine-tune: 0.895, 0.923, 0.934, with worse WER throughout                                                       | A long prompt matched fine-tuning                                 |
| [LoRP-TTS](https://arxiv.org/html/2502.07562v1) (authors)                              | Voicebox-style                | Per-speaker LoRA                                                                | Up to 30 points more similarity on hard, expressive prompts; "marginal" on a studio-quality set                                              | Clean studio input is already a strong baseline                   |
| [Purwar and Choudhary 2026](https://arxiv.org/abs/2603.10904) (authors)                | LLM TTS on Qwen-0.5B, LoRA    | Several speakers, amount not stated                                             | DNS-MOS up to +0.42, only for speakers whose training audio varied                                                                           | The gain depended on how varied the training audio was            |

What this means for TTSNative:

- **Documented:** adapting to a speaker helps, but modestly. Listeners notice it more than the
  similarity scores show (Seed-TTS CMOS, CSP-FT SMOS).
- **Documented:** a full fine-tune on little data made words less clear or the speech less natural
  in CosyVoice 2, CSP-FT and the Singlish study. Training only a few layers did not. The Chatterbox
  fine-tuning toolkit warns of the same thing for Turbo.
- **Documented, for an older model:** a long prompt recovered most of the gain without training.
  This route is closed for Turbo (inference): its prompts are capped at 15 s for T3 and 10 s for
  S3Gen, the lengths it was trained on.
  - Engines that accept several references: Orpheus (several text and speech pairs), CSM-1B (context
    segments), XTTS-v2 (several clips) and OpenVoice (averaged embeddings, timbre only).
- **Inference:** a session is one microphone, one room and one sitting. Two of the studies found
  smaller gains on clean or uniform data. The styled passages (questions, exclamations, dialogue)
  are the session's most useful variety.
- **Anecdotal:** in a
  [blog post](https://nexustrade.io/blog/best-ai-voice-cloning-2026-how-to-clone-your-voice-with-ai-20260824),
  one person blind-ranked fine-tunes of their own voice trained on 45 minutes of phone recordings.
  Fine-tuned dots.tts came first and MOSS-TTS second; fine-tuned Qwen3-TTS had "good audio, but not
  the author's voice"; zero-shot Chatterbox was mid-pack. One listener, one voice, and the page also
  carries instructions written for AI coding agents.
- **Not found:** any published single-speaker Turbo LoRA result.

## Comparison table

"Adapt" means using tens of minutes of one speaker (fine-tune or LoRA). VRAM is for synthesis.

| Engine                                   | Code licence                     | Weights licence                                             | Audio and use terms                                   | Adapt to 30 min                                | Size, VRAM                     | Verdict                              |
| ---------------------------------------- | -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------ |
| **Chatterbox Turbo** (current)           | MIT                              | MIT                                                         | Perth watermark on every clip                         | Community T3 LoRA (Apache-2.0 toolkit)         | 350M, 3.0 GB, ~4 GB            | **Keep; test a T3 LoRA**             |
| Chatterbox 0.5B / Multilingual V3 / Nano | MIT                              | MIT                                                         | Perth                                                 | Community T3 fine-tune                         | 500M (Nano 110M)               | Optional A/B arm (emotion controls)  |
| F5-TTS / E2-TTS                          | MIT                              | **CC-BY-NC-4.0** (Emilia data)                              | Non-commercial                                        | Official (Gradio fine-tune)                    | Not stated                     | No: weights                          |
| XTTS-v2 (coqui-tts, idiap fork)          | MPL-2.0                          | **CPML**: non-commercial, outputs included                  | Recipients of output must get the terms               | Official recipe                                | ~1.8 GB                        | No: weights                          |
| StyleTTS 2                               | MIT                              | Pretrained: must disclose synthesis unless voice permission | Disclosure duty                                       | Official (~1 h data)                           | Not stated                     | No: older, English, GPL phonemiser   |
| OpenVoice v2                             | MIT                              | MIT                                                         | Watermark on by default; AGPL dependency              | None for the converter                         | Not stated                     | No: timbre only                      |
| CosyVoice 2 / Fun-CosyVoice3             | Apache-2.0                       | Apache-2.0                                                  | "Academic purposes only" disclaimer on demos          | Official recipe (full)                         | 0.5B                           | Reserve: Linux-oriented              |
| Fish Speech / OpenAudio S1-mini / S2-Pro | **Fish Audio Community Licence** | **CC-BY-NC-SA-4.0** / **research licence**                  | Revenue cap, attribution, no output for training      | S2-Pro code                                    | 0.5–5B, S2-Pro ≥24 GB          | No: licence                          |
| IndexTTS2 / 2.5                          | **bilibili Model Use Licence**   | Same                                                        | Outputs are "derivative works"; PRC law               | Community LoRA                                 | ~0.8B, ~6 GB                   | Licence review first                 |
| Spark-TTS                                | Apache-2.0                       | **CC-BY-NC-SA-4.0**                                         | Non-commercial                                        | Training code unreleased                       | 0.5B                           | No: weights                          |
| **GPT-SoVITS**                           | MIT                              | MIT                                                         | None stated; training data undocumented               | **Official, from 1 minute**                    | RTF 0.014 on an RTX 4090       | **Experiment**                       |
| Orpheus                                  | Apache-2.0                       | Apache-2.0 label on a Llama 3.2 fine-tune, gated            | No impersonation without consent                      | Official script (300 examples), LoRA           | 3B, 15 GB (F32)                | Licence question; heavy              |
| Sesame CSM-1B                            | Apache-2.0                       | Apache-2.0, gated; Llama tokenizer; Mimi CC-BY-4.0          | No imitation without consent                          | Community only                                 | 6.2 GB, CUDA                   | Licence question; dormant            |
| Dia / Dia2                               | Apache-2.0                       | Apache-2.0                                                  | "Research and educational use" disclaimer             | Community (Dia) / none                         | 1.6B, ~4.4 GB, CUDA            | No: dialogue focus, dormant          |
| Zonos v0.1 / ZONOS2                      | Apache-2.0                       | Apache-2.0                                                  | v0.1 requires GPL phonemizer                          | None                                           | 3.3 GB, 6 GB+; Linux           | No                                   |
| Higgs Audio v2 / v3                      | Apache-2.0                       | **v2 Llama-style community licence; v3 non-commercial**     | User cap, naming and attribution duties               | Community LoRA (v2)                            | ~6B, 24 GB+                    | No: licence, size                    |
| VibeVoice                                | MIT                              | MIT                                                         | Research only; audible disclaimer; TTS code withdrawn | Experimental community                         | 1.5B, 5.4 GB                   | No: withdrawn                        |
| MegaTTS 3                                | Apache-2.0                       | Apache-2.0, **encoder withheld**                            | New voices need latents from ByteDance                | None                                           | 0.45B                          | No: not local                        |
| MaskGCT (Amphion)                        | MIT                              | **CC-BY-NC-4.0**                                            | Non-commercial; GPL phonemizer                        | None documented                                | ~1.3B total                    | No: weights                          |
| Piper (piper1-gpl)                       | **GPL-3.0**                      | Per voice                                                   | n/a                                                   | Official, from a checkpoint                    | 20–100 MB per voice            | No: no cloning, lower quality        |
| Kokoro-82M (built in)                    | Apache-2.0 (kokoro-onnx: MIT)    | Apache-2.0                                                  | Data provenance question (legal audit)                | No training code                               | 82M, CPU                       | Stays the reader engine              |
| **VoxCPM2 / VoxCPM 1.5**                 | Apache-2.0                       | Apache-2.0 (backbone licence to confirm)                    | Bans impersonation; asks for labels; no watermark     | **Official LoRA and full, hot-swappable LoRA** | 2B, 5.0 GB, ~8 GB (1.5: ~6 GB) | **Experiment (first choice)**        |
| **dots.tts**                             | Apache-2.0                       | Apache-2.0                                                  | None stated; no watermark                             | Official full fine-tune script                 | 2B, 5.2 GB, 5.7–10.5 GB        | **Experiment (zero-shot)**           |
| **Qwen3-TTS**                            | Apache-2.0                       | Apache-2.0                                                  | None stated; no watermark                             | Official single-speaker SFT                    | 1.7B, 4.5 GB; also 0.6B        | **Experiment**                       |
| MOSS-TTS / MOSS-TTSD                     | Apache-2.0 (stated for models)   | Apache-2.0                                                  | None stated                                           | Tutorials, details not stated                  | 0.1–8B                         | Watch                                |
| NeuTTS Air                               | **Unclear**                      | Apache-2.0, gated (Nano/2E: custom)                         | Perth on by default; GPL phonemizer                   | Official script (~10 h)                        | 0.7B, CPU GGUF                 | No: unclear licence, needs more data |
| Kyutai Pocket TTS / TTS 1.6B             | MIT (Pocket TTS)                 | CC-BY-4.0, gated                                            | No cloning without consent                            | Needs 100 h or more                            | 100M, CPU                      | No: not an adaptation route          |
| Step-Audio-EditX                         | Apache-2.0                       | **Not stated**                                              | n/a                                                   | SFT, DPO and GRPO code                         | 3B, 12–16 GB, Linux            | No: weights licence missing          |

### The shortlisted engines in more detail

Quality figures are the authors' own, on Seed-TTS-eval (English: word error rate and speaker
similarity), unless marked otherwise. Similarity scores from different papers are not strictly
comparable. Turbo's card has no Seed-TTS-eval figures, only a preference chart image.

| Engine           | Voice fidelity (claimed)                  | Emotion and prosody                                  | Pronunciation                     | Several references              | Long-form                           | Speed and hardware                                          | Languages |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------- | ----------------------------------- | ----------------------------------------------------------- | --------- |
| Chatterbox Turbo | Measured by us (voice-ab), not published  | No emotion conditioning; style prompts; 9 sound tags | `punc_norm` rewrites some marks   | Only averaged embeddings (ours) | Per sentence, seeded retries (ours) | GPU ~4 GB; CPU much slower than real time                   | English   |
| VoxCPM2          | WER 1.84, similarity 75.3                 | Style text with a reference ("controllable cloning") | No phonemiser mentioned           | Reference plus transcript       | Not stated                          | RTF ~0.30 on an RTX 4090; CPU via GGUF (RTF 1.76 on M4 Pro) | 30        |
| dots.tts         | WER 1.30, similarity 77.1                 | EmergentTTS emotions 72.7 % (pretrained model)       | Weaker WER in rare languages      | One ~10 s ("longer won't help") | Clips up to ~82 s benchmarked       | RTF 0.13–0.20 (H800); CPU not addressed                     | 24 tested |
| Qwen3-TTS        | WER 1.24; similarity 0.775 (multilingual) | Separate VoiceDesign and CustomVoice models          | Needs the reference transcript    | One reference                   | Not stated                          | FlashAttention 2 recommended; CPU not addressed             | 10        |
| GPT-SoVITS       | Similarity chart only (image)             | Comes from the reference                             | G2PW for Chinese; English unknown | Not checked                     | Not stated                          | RTF 0.014 (RTX 4090), 0.526 (M4 CPU); Windows package       | 5         |

## Per-engine notes

### The Chatterbox family (current engine)

- **Turbo** ([repo](https://github.com/resemble-ai/chatterbox), 27.1k★;
  [card](https://huggingface.co/ResembleAI/chatterbox-turbo)).
  - MIT code and weights. 350M parameters, English, a one-step decoder and native sound tags.
  - Every output carries the Perth watermark. Resemble gives no fine-tuning instructions.
  - **Documented:** [gokhaneraslan/chatterbox-finetuning](https://github.com/gokhaneraslan/chatterbox-finetuning)
    (Apache-2.0, 118★) trains T3 only, by LoRA (for ≤10 h of data) or in full. It needs at least 30
    minutes of 3–10 s segments, and Silero VAD trims the output.
  - **Documented:** it warns that a full Turbo fine-tune may produce "static, hallucinations, or
    meaningless sounds".
  - **Claimed:** the author reports "highly successful, stable results" with a Turbo LoRA. It
    publishes no VRAM figures or metrics.
- **Original 0.5B, Multilingual V3 and Nano** (same repo, MIT).
  - **Documented:** the 0.5B models keep `exaggeration` and `cfg_weight`, which Turbo dropped.
  - **Documented** ([`tts.py`](https://raw.githubusercontent.com/resemble-ai/chatterbox/master/src/chatterbox/tts.py)):
    the original's T3 prompt uses only the first 6 s of the reference, against Turbo's 15 s.
  - Multilingual V3 (23+ languages) claims "improved speaker similarity and reduced
    hallucinations"; Nano (110M) claims 3× real time on 8 CPU cores.
  - **Inference:** the exaggeration control could help lively lines, at the cost of Turbo's sound
    tags and speed. It is a cheap A/B arm because it is the same code family.
  - The [Singlish study](https://arxiv.org/html/2607.23027) above is the only independent
    Chatterbox fine-tune with numbers. It shows the full-fine-tune trade-off: closer to the target
    speakers, but less clear and lower predicted MOS.

### Worth an experiment

- **VoxCPM2 and VoxCPM 1.5** ([repo](https://github.com/OpenBMB/VoxCPM), 39.7k★, commits
  2026-10-08; [card](https://huggingface.co/openbmb/VoxCPM2)).
  - **Licence (documented):** the README says "VoxCPM model weights and code are open-sourced under
    the Apache-2.0 license", free for commercial use. The card forbids impersonation, fraud and
    disinformation and asks that AI audio be labelled. There is no watermark.
  - **Models (documented):** VoxCPM2 is 2B, 48 kHz, 30 languages, ~8 GB VRAM, and the download is
    4.96 GB ([files](https://huggingface.co/openbmb/VoxCPM2/tree/main)). VoxCPM 1.5 is 0.6–0.8B (the
    pages disagree), 44.1 kHz, Chinese and English, ~6 GB VRAM.
  - **Backbone (documented):** VoxCPM2 is "based on MiniCPM-4", whose licence the card doesn't
    state.
  - **Fine-tuning (documented,** [docs](https://voxcpm.readthedocs.io/en/latest/finetuning/finetune.html)**):**
    - Data for one speaker: 5–50 clips of 3–30 s, plus 30–50 % of samples with a reference from the
      same speaker.
    - LoRA settings: on the LM and the DiT, r = 32, 1–3 epochs.
    - VRAM at batch 16: LoRA ~12 GB (1.5) or ~20 GB (2), full fine-tune ~24 or 40 GB.
    - Adapters load, unload and toggle without restarting the model.
    - The docs warn of overfitting within a few hundred steps, and that validation loss does not
      track perceived quality.
  - **Claimed:** 5–10 minutes is enough to adapt. In internal tests, LoRA reached ~98 % of the
    similarity of a full fine-tune.
  - **Unknowns:** Windows support is not mentioned. It needs Python 3.10–3.12, PyTorch ≥2.5 and
    CUDA ≥12.0.
- **dots.tts** ([repo](https://github.com/studio-dots-ai/dots.tts), 1.4k★, released 2026-06;
  [card](https://huggingface.co/dots-studio/dots.tts-soar)).
  - **Licence (documented):** "code and released checkpoints are licensed under Apache-2.0".
  - **Model (documented):** 2B, initialised from Qwen2.5-1.5B-Base, continuous (no speech tokens),
    48 kHz. The download is 5.16 GB.
  - **Fine-tuning (documented):** there is a full fine-tune script, but no LoRA and no training VRAM
    figure.
  - **Inference:** a full fine-tune of 2B does not fit a 10 GB card, so test it zero-shot. It is a
    young project (32 commits).
- **Qwen3-TTS** ([repo](https://github.com/QwenLM/Qwen3-TTS), 13.9k★, last commit 2026-03-17;
  [card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base)).
  - **Licence (documented):** Apache-2.0 code and weights.
  - **Fine-tuning (documented,** [finetuning](https://github.com/QwenLM/Qwen3-TTS/tree/main/finetuning)**):**
    official single-speaker SFT, using the same reference clip for every sample. The page doesn't
    say whether it is LoRA or full, nor the VRAM or data needed. The result is a named speaker.
  - **Anecdotal:** the blog above found its fine-tune lost the speaker's identity.
- **GPT-SoVITS** ([repo](https://github.com/RVC-Boss/GPT-SoVITS), 63.4k★, V5 on 2026-10-05;
  [weights](https://huggingface.co/lj1995/GPT-SoVITS)).
  - **Licence (documented):** MIT code, and the weights card is labelled MIT. The pretraining data
    is not documented.
  - **Design (documented):** it is built around fine-tuning. It has 5 s zero-shot cloning and
    fine-tunes the GPT and SoVITS stages "with just 1 minute of training data".
  - **Training VRAM (documented):** about 8 GB for a v3 LoRA, and 12–14 GB for a full fine-tune.
  - **Platform (documented):** a Windows package. V4 outputs 48 kHz natively.
  - **Inference:** English quality against Turbo is unknown. It is an application with a WebUI, so
    wrapping it in a worker is more work.

### In reserve

- **CosyVoice 2 and Fun-CosyVoice3** ([repo](https://github.com/FunAudioLLM/CosyVoice), 24.1k★).
  - Apache-2.0 code and weights, 0.5B.
  - The best-documented evidence on adapting to one speaker comes from this family (table above).
  - The official recipe trains the LM, flow and vocoder, with a 4-GPU example. Install is
    Linux-oriented.
- **IndexTTS2 / 2.5** ([repo](https://github.com/index-tts/index-tts)).
  - It separates emotion from timbre (an emotion reference, vector or text prompt). A community LoRA
    ([asr-pub/index-tts-lora](https://github.com/asr-pub/index-tts-lora), Apache-2.0) uses a
    30-minute single-speaker example.
  - Its [licence](https://github.com/index-tts/index-tts/blob/main/LICENSE) is bilibili's own:
    outputs count as "Derivative Works", no use to improve other AI models, a separate licence above
    100M monthly users, PRC law with the Chinese text prevailing. Training data was mostly Emilia
    (CC-BY-NC).
- **Orpheus** ([repo](https://github.com/canopyai/Orpheus-TTS)) and **CSM-1B**
  ([repo](https://github.com/SesameAILabs/csm)) accept several reference pairs or segments, and
  Orpheus has an official fine-tune script. Both are Llama-based with Apache-2.0 labels (whether the
  Llama 3.2 licence also applies is unclear), large for a 10 GB card and quiet since 2025.

### Not suitable now

- **F5-TTS** ([card](https://huggingface.co/SWivid/F5-TTS)), **MaskGCT**
  ([card](https://huggingface.co/amphion/MaskGCT)) and **Spark-TTS**
  ([card](https://huggingface.co/SparkAudio/Spark-TTS-0.5B)) have non-commercial weights.
- **XTTS-v2** ([licence](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt)): the CPML
  "allows only non-commercial use of a machine learning model and its outputs". Coqui has closed, so
  no commercial licence can be bought. The [idiap fork](https://github.com/idiap/coqui-ai-TTS)
  (MPL-2.0, Windows wheels) maintains the code only.
- **Fish Audio** ([repo](https://github.com/fishaudio/fish-speech)): the code licence caps
  commercial use at US$500k revenue, bans hosted services and requires "Built with Fish Audio";
  S2-Pro is research-only and S1-mini CC-BY-NC-SA; Linux or WSL only.
- **Higgs Audio**: v2 has
  [Llama-style terms](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE)
  with a 100k-user cap and naming duties, v3 is non-commercial, and no v2.5 weights were found.
- **VibeVoice**: TTS was "disabled due to widespread misuse"
  ([doc](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-tts.md)). The
  Realtime-0.5B model has preset voices only.
- **MegaTTS 3** ([repo](https://github.com/bytedance/MegaTTS3)): the encoder is withheld, so new
  voices need latents from ByteDance. That breaks local-first.
- **OpenVoice v2** ([repo](https://github.com/myshell-ai/OpenVoice)) clones "tone color" only, not
  accent or emotion. Its requirements include the AGPL `whisper-timestamped`, and it was last
  changed in April 2025.
- **Zonos, Dia, Dia2**: no adaptation path, CUDA- or Linux-centred, and dormant. Zonos v0.1
  requires GPL `phonemizer`.
- **StyleTTS 2** ([repo](https://github.com/yl4579/StyleTTS2)): MIT code, but the pretrained
  models oblige you to tell listeners speech is synthesized unless you have permission to use the
  voice. The published fine-tune took about 4 hours on four A100s for 1 hour of data, and it needs a
  GPL phonemiser.
- **Piper** ([training](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/TRAINING.md)):
  GPL-3.0 code and no cloning. Fine-tuning from a medium checkpoint is documented and makes fast
  22.05 kHz CPU voices, at Piper's quality, below Kokoro.
- **Kokoro-82M** ([card](https://huggingface.co/hexgrad/Kokoro-82M)): a StyleTTS 2 descendant
  (decoder-only, no diffusion, no encoder released) with Apache-2.0 weights, no training code and no
  cloning. Community tools search its 256-d voice vector for a match:
  [KVoiceWalk](https://github.com/RobViren/kvoicewalk) (Apache-2.0) claims 71 % → 93 % on its own
  Resemblyzer score, with runs that sometimes stall. Not a fidelity route.
- **Newer, not pursued:** MOSS-TTS/TTSD ([repo](https://github.com/OpenMOSS/MOSS-TTS), Apache-2.0)
  is large and its fine-tune details are not stated. NeuTTS Air
  ([repo](https://github.com/neuphonic/neutts)) shows a custom licence in its repository, gated
  weights and a fine-tune guide for ~10 h of data. Kyutai Pocket TTS
  ([repo](https://github.com/kyutai-labs/pocket-tts)) trains on 100 h or more. Step-Audio-EditX
  ([card](https://huggingface.co/stepfun-ai/Step-Audio-EditX)) has no weights licence on its card.

## Licence questions for the owner

1. **VoxCPM2:** confirm that the MiniCPM-4 backbone is covered by the Apache-2.0 grant, from the
   LICENSE files at the pinned revision. Pages from the same project also disagree on VoxCPM 1.5's
   parameter count.
2. **dots.tts:** confirm the Qwen2.5-1.5B-Base licence. Qwen's licences differ by model size.
3. **GPT-SoVITS:** its MIT weights say nothing about the rights to its training data. This is the
   same class of question as Kokoro's provenance in the
   [legal audit](../legal/legal-risk-audit.md).
4. **Orpheus and CSM-1B:** Apache-2.0 labels on Llama-derived weights or tokenizers. Does the Llama
   3.2 Community Licence (attribution, naming, acceptable use) also apply?
5. **IndexTTS2:** a custom licence under PRC law, plus mostly Emilia (CC-BY-NC) training data. This
   needs counsel before any use.
6. **Use terms that are not licences:** CosyVoice's "academic purposes" disclaimer, Dia's "research
   and educational use", and VoxCPM's impersonation ban and labelling request. The consent step
   covers the intent, but Settings should show them.
7. **Watermark parity:** Turbo marks every clip, while VoxCPM, dots.tts and Qwen3-TTS mark nothing.
   - Perth ([resemble-ai/Perth](https://github.com/resemble-ai/Perth), MIT) watermarks any audio
     file in its examples, so a second engine could keep the promise that cloned speech is marked
     (legal audit, EU AI Act Art. 50(2)).
   - How well the mark survives at 44.1 or 48 kHz is not documented.
8. **Consent for training:** an adapter is a trained model of a person's voice, closer to the takes
   than to a 15 s prompt. Decide whether the consent statement covers training. Also decide whether
   adapters may ever go into a `.ttsvoice` package (ADR-12 excludes takes for this reason).

## Adding a second studio engine without harming local-first

This applies only if the experiment shows a clear, blind-tested gain. It would need its own ADR.

- **Own worker and environment.** A new uv project under `apps/<engine>-worker` with its own lock,
  the 14-day cool-down and advisory triage (ADR-4, ADR-8), installed on demand from Settings into
  `data/engines/<engine>/venv`. `chatterbox_env.py` already takes a project directory, so it could
  become an engine-neutral helper.
- **Same protocol.** `load`, `synthesize`, `ping` and `shutdown` carry over, as does offline mode
  set before any ML import. Weights get a manifest entry with a pinned revision and SHA-256 per
  file, and `require_intact` runs before every load.
- **Studio interface.** `VoiceBuilder` is shaped around Chatterbox (speaker embeddings, x-vector,
  T3 style prompts). A second engine needs its own builder that takes takes plus transcripts.
  Recorded takes read known passages, so their text exists; imported recordings would need speech
  recognition.
- **Training is a job, not a call.** `WorkerClient.call` serialises requests under one lock, with
  a 600 s ceiling for studio ops and no progress messages. Training would run as its own process,
  reporting progress to `JobContext`, with cancel and resume from checkpoints. The synthesis worker
  stops meanwhile, because a 10 GB GPU can't hold both.
- **Local-first.** Nothing downloads until asked. Training runs only on the user's own GPU, when
  free VRAM is measured to be enough, never in the cloud. CPU-only users keep Turbo.
- **Licence notice.** `EngineInfo.license` comes from the manifest, and Settings shows the licence
  and use terms before install. `ATTRIBUTION.md`, the licence inventory and section 6 of the legal
  audit gain a row. The worker applies Perth if the owner wants parity (question 7).
- **A/B before replacement.** A build with the new engine is a candidate beside the existing studio
  voice, which is replaced only when the person picks the new one blind; switching back takes one
  click. `ltts voice-ab` would need an engine-neutral similarity measure: today it uses
  Chatterbox's own embeddings, which favour Chatterbox.
- **Effort (inference):** a Turbo LoRA in the existing worker is M–L (training job, PEFT, adapter
  loading, UI); a second engine without training is M (like `chatterbox.py`, ~400 lines); with
  training, L.

## Experiment plan for approval (not run)

**Setup.**

- Use a copy of one 48-passage session: train on 40 passages and hold out 8, including a question,
  an exclamation and a dialogue passage. The test set is 20 sentences: the 8 held-out passages
  (which have real recordings) plus 12 from the `voice-ab` set. Fixed seeds.
- Level every clip to -23 dBFS, and judge identity on copies resampled to 24 kHz so that 48 kHz
  output can't win on brightness alone.
- Run each engine from its own scratch environment outside the repository; nothing is added to the
  app. This PC has shown RAM bit flips: verify weight checksums before and after, and repeat any
  surprising result, ideally on another machine.

**Phase 1, zero-shot screen (synthesis only).**

- Arms, all from the same 15 s reference: the current Turbo studio voice, VoxCPM2 (reference plus
  transcript), dots.tts (10 s reference), Qwen3-TTS-1.7B-Base and GPT-SoVITS (V5 or v2Pro).
  Optionally add Chatterbox Multilingual V3 with exaggeration.
- Measures: blind preference from the owner and at least two people who know the voice, each
  against the hidden real recording; word error rate from a local Whisper model; similarity from an
  independent verifier (for example SpeechBrain ECAPA-TDNN) and from Chatterbox's encoder; counts of
  skipped, repeated or invented words.
- An engine goes on to phase 2 only if it at least matches Turbo by ear.

**Phase 2, adaptation.** Arms: a Turbo T3 LoRA (always), a VoxCPM LoRA (1.5 at a reduced batch
size, or 2 if it fits) and GPT-SoVITS if it passed phase 1. Train on the 40 passages cut into
3–10 s sentences for 1–3 epochs, and judge saved checkpoints by listening, not by loss.

**Decision rule.** Adopt only if the adapted voice is preferred in at least 15 of 20 blind pairs by
each listener (p ≈ 0.02 against chance), with a word error rate no more than 1 point worse and no
new failure types.

**Resources.**

| Item                | Download                                 | VRAM                                                   | Time (estimate unless stated)      |
| ------------------- | ---------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Turbo T3 LoRA       | Toolkit packages only (weights in place) | Under 12 GB at batch 2 with accumulation (fork report) | Not published; guess 1–3 h per run |
| VoxCPM2 / 1.5       | 4.96 GB (VoxCPM2) + environment          | ~8 GB to synthesise; LoRA 12–20 GB at batch 16         | Not published; guess 1–2 h per run |
| dots.tts            | 5.16 GB + environment                    | 5.7–10.5 GB peak (on an H800)                          | Synthesis only, minutes            |
| Qwen3-TTS 1.7B Base | 4.54 GB + environment                    | Not stated                                             | Synthesis only, minutes            |
| GPT-SoVITS          | Not checked                              | LoRA ~8 GB, full 12–14 GB (v3)                         | Not stated                         |

Each extra PyTorch CUDA environment costs about 2.8 GB to download and 5.4 GB on disk, like ours:
in total about 15 GB of models and 11 GB of packages, so plan for 50 GB of free disk, about a day of
GPU time and an afternoon of listening. On a 10 GB card, VoxCPM2's LoRA and full fine-tunes of 2B
models are unlikely to fit. Renting a GPU would mean sending the recordings off the computer, which
is for the owner to decide.

## Pages that addressed AI agents (ignored)

None of these was acted on:

- [fish-speech](https://github.com/fishaudio/fish-speech): a "For LLM Agent" section says to install
  Drama 3 or S2-Pro.
- [Unsloth's TTS docs](https://unsloth.ai/docs/basics/text-to-speech-tts-fine-tuning): "Agent
  Instructions" ask for an HTTP GET with query parameters. No request was sent.
- [higgs-tts-3-4b `AGENTS.md`](https://huggingface.co/bosonai/higgs-tts-3-4b/blob/main/AGENTS.md): a
  guide for coding agents, including what to do about an API key.
- The nexustrade blog above: a "copy-paste plan" for coding agents to rent GPUs, train and upload to
  Hugging Face.
- [pocket-tts training](https://github.com/kyutai-labs/pocket-tts/tree/main/training): suggests
  asking "your coding agent" to adapt its scripts. Benign.
