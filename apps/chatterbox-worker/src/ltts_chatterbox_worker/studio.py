# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Studio-voice operations: measure session takes, build a voice and audition it.

Scope: ``measure`` returns each take's speaker embeddings (voice encoder and S3Gen x-vector) and pitch
spread; ``build`` turns one prompt take plus an optional session identity into Chatterbox Turbo
conditioning and saves it as safetensors (no pickle); ``build_style`` turns a few takes of one
speaking style (questions, conversation, lively lines) into T3 prompt tokens only, filling T3's whole
15 s with speech by joining takes and shortening long pauses (``prompt_tokens``), since Turbo's
inflection comes from that prompt; ``load_conditioning`` reads a voice back, optionally with a style's
prompt in place of its own; ``generate`` runs seeded and without autograd; ``audition`` generates
seeded samples from a conditioning and scores each against a speaker embedding. Mirrors
``ChatterboxTurboTTS.prepare_conditionals``: loudness-normalised reference, the first 10 s for S3Gen's
prompt and the first 15 s for T3's prompt tokens.
Does NOT belong: The JSON-lines protocol (``__main__``), ranking takes or file management (the
server owns those).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

FORMAT = "ltts-chatterbox-conditioning"
VERSION = "1"
STYLE_FORMAT = "ltts-chatterbox-style"
STYLE_VERSION = "1"
PAUSE_S = 0.3  # pauses inside a style prompt are shortened to this, and takes are joined with it
EMOTION_ADV = 0.5  # what prepare_conditionals stores; Turbo ignores it
# Token tensors (synthesis turns them into floats in place, so they are cast back to long on load).
T3_TOKENS = "t3.cond_prompt_speech_tokens"
GEN_TOKENS = "gen.prompt_token"
GEN_TOKENS_LEN = "gen.prompt_token_len"
_LONG_KEYS = (T3_TOKENS, GEN_TOKENS, GEN_TOKENS_LEN)
_SAMPLING = {"temperature": "temperature", "topP": "top_p", "topK": "top_k"}  # request field -> argument
_QUOTES = str.maketrans("", "", '"“”')  # double quotes can come out as a breathy sound


def sampling(request: dict[str, Any]) -> dict[str, Any]:
    """The optional sampling settings in a request, as ``generate`` keyword arguments."""
    settings: dict[str, Any] = {
        argument: float(request[field]) for field, argument in _SAMPLING.items() if field in request
    }
    if "top_k" in settings:
        settings["top_k"] = int(settings["top_k"])
    return settings


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else vector


def load_take(model: Any, path: str) -> tuple[np.ndarray, np.ndarray]:
    """The take at 24 kHz (loudness-normalised like prepare_conditionals) and at 16 kHz."""
    import librosa
    from chatterbox.models.s3gen import S3GEN_SR
    from chatterbox.models.s3tokenizer import S3_SR

    wav24, _ = librosa.load(path, sr=S3GEN_SR)
    wav24 = model.norm_loudness(wav24, S3GEN_SR)
    return wav24, librosa.resample(wav24, orig_sr=S3GEN_SR, target_sr=S3_SR)


def _speaker(model: Any, wav16: np.ndarray) -> np.ndarray:
    from chatterbox.models.s3tokenizer import S3_SR

    return _unit(np.asarray(model.ve.embeds_from_wavs([wav16], sample_rate=S3_SR)[0], dtype=np.float32))


def _xvector(model: Any, wav16: np.ndarray) -> np.ndarray:
    import torch

    audio = torch.from_numpy(wav16).float().to(model.device)
    with torch.inference_mode():
        vector = model.s3gen.speaker_encoder.inference([audio])[0]
    return _unit(vector.detach().float().cpu().numpy())


def _pitch_spread(wav16: np.ndarray) -> tuple[float, float]:
    """Spread of the voiced pitch in semitones (how much the voice rises and falls) and the voiced share."""
    import librosa
    from chatterbox.models.s3tokenizer import S3_SR

    f0, voiced, _ = librosa.pyin(wav16, fmin=60.0, fmax=400.0, sr=S3_SR, frame_length=1024)
    pitches = f0[voiced & np.isfinite(f0)]
    if pitches.size < 10:
        return 0.0, float(np.mean(voiced))
    semitones = 12 * np.log2(pitches / np.median(pitches))
    return float(np.std(semitones)), float(np.mean(voiced))


def measure(model: Any, paths: list[str]) -> list[dict[str, Any]]:
    takes = []
    for path in paths:
        _, wav16 = load_take(model, path)
        spread, voiced = _pitch_spread(wav16)
        takes.append(
            {
                "path": path,
                "speakerEmb": _speaker(model, wav16).tolist(),
                "xvector": _xvector(model, wav16).tolist(),
                "pitchSpread": round(spread, 3),
                "voicedRatio": round(voiced, 3),
            }
        )
    return takes


def build(model: Any, prompt: str, output: str, speaker_emb: list[float] | None, xvector: list[float] | None) -> None:
    """Conditioning from one prompt take; the session identity, when given, replaces the take's own."""
    import torch
    from chatterbox.models.s3gen import S3GEN_SR
    from safetensors.torch import save_file

    wav24, wav16 = load_take(model, prompt)
    with torch.inference_mode():
        gen = model.s3gen.embed_ref(wav24[: model.DEC_COND_LEN], S3GEN_SR, device=model.device)
        tokens, _ = model.s3gen.tokenizer.forward(
            [wav16[: model.ENC_COND_LEN]], max_len=model.t3.hp.speech_cond_prompt_len
        )
    speaker = np.asarray(speaker_emb, dtype=np.float32) if speaker_emb else _speaker(model, wav16)
    embedding = gen["embedding"].detach().float().cpu()
    if xvector:
        # S3Gen normalises the x-vector itself; keep the take's scale so only its direction changes.
        embedding = torch.tensor(_unit(np.asarray(xvector, dtype=np.float32)))[None] * embedding.norm()
    tensors = {
        "t3.speaker_emb": torch.from_numpy(_unit(speaker))[None],
        T3_TOKENS: torch.atleast_2d(tokens).long().cpu(),
        GEN_TOKENS: gen["prompt_token"].long().cpu(),
        GEN_TOKENS_LEN: gen["prompt_token_len"].long().cpu(),
        "gen.prompt_feat": gen["prompt_feat"].float().cpu(),
        "gen.embedding": embedding,
    }
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    contiguous = {key: value.contiguous() for key, value in tensors.items()}
    save_file(contiguous, output, {"format": FORMAT, "version": VERSION})


def _shorten_pauses(wav16: np.ndarray, sample_rate: int) -> np.ndarray:
    """The take without its silent edges, and with every pause inside it at most ``PAUSE_S`` long."""
    frame = max(sample_rate // 50, 1)  # 20 ms
    usable = len(wav16) - len(wav16) % frame
    if usable == 0:
        return wav16
    frames = wav16[:usable].reshape(-1, frame)
    level = 20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-9)
    voiced = level > float(level.max()) - 40.0
    keep = np.zeros(len(voiced), dtype=bool)
    longest = round(PAUSE_S * sample_rate / frame)
    run = 0
    for index, is_voiced in enumerate(voiced):
        run = 0 if is_voiced else run + 1
        keep[index] = is_voiced or run <= longest
    indexes = np.nonzero(voiced)[0]
    if indexes.size == 0:
        return wav16[:0]
    keep[: indexes[0]] = False
    keep[indexes[-1] + 1 :] = False
    return np.asarray(frames[keep].reshape(-1), dtype=np.float32)


def prompt_tokens(model: Any, takes: list[np.ndarray]) -> tuple[Any, float]:
    """T3 prompt tokens from 16 kHz takes joined (pauses shortened) until T3's 15 s are full, and the seconds used."""
    import torch
    from chatterbox.models.s3tokenizer import S3_SR

    gap = np.zeros(int(PAUSE_S * S3_SR), dtype=np.float32)
    pieces: list[np.ndarray] = []
    for wav16 in takes:
        pieces += [_shorten_pauses(wav16, S3_SR), gap]
        if sum(len(piece) for piece in pieces) >= model.ENC_COND_LEN:
            break
    audio = np.concatenate(pieces)[: model.ENC_COND_LEN]
    with torch.inference_mode():
        tokens, _ = model.s3gen.tokenizer.forward([audio], max_len=model.t3.hp.speech_cond_prompt_len)
    return torch.atleast_2d(tokens).long().cpu(), round(len(audio) / S3_SR, 2)


def build_style(model: Any, prompts: list[str], output: str) -> float:
    """T3 prompt tokens from takes of one style, joined until T3's 15 s are full; returns the seconds used."""
    from safetensors.torch import save_file

    tokens, seconds = prompt_tokens(model, [load_take(model, prompt)[1] for prompt in prompts])
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    save_file({T3_TOKENS: tokens.contiguous()}, output, {"format": STYLE_FORMAT, "version": STYLE_VERSION})
    return seconds


def _style_tokens(path: str) -> Any:
    from safetensors import safe_open
    from safetensors.torch import load_file

    with safe_open(path, framework="pt") as handle:
        meta = handle.metadata() or {}
    if meta.get("format") != STYLE_FORMAT or meta.get("version") != STYLE_VERSION:
        raise ValueError("Unsupported voice style file")
    return load_file(path, device="cpu")[T3_TOKENS].long()


def load_conditioning(path: str, device: str, style: str | None = None) -> Any:
    """Rebuild ``Conditionals`` with fresh, unshared tensors (synthesis caches embeddings into them).

    With ``style``, that style's T3 prompt replaces the voice's own: the same sound (S3Gen's prompt and
    the speaker embeddings stay), with the rhythm and inflection of takes in that style.
    """
    import torch
    from chatterbox.models.t3.modules.cond_enc import T3Cond
    from chatterbox.tts_turbo import Conditionals
    from safetensors import safe_open
    from safetensors.torch import load_file

    with safe_open(path, framework="pt") as handle:
        meta = handle.metadata() or {}
    if meta.get("format") != FORMAT or meta.get("version") != VERSION:
        raise ValueError("Unsupported voice conditioning file")
    tensors = load_file(path, device="cpu")
    for key in _LONG_KEYS:
        tensors[key] = tensors[key].long()
    if style:
        tensors[T3_TOKENS] = _style_tokens(style)
    t3 = T3Cond(
        speaker_emb=tensors["t3.speaker_emb"],
        cond_prompt_speech_tokens=tensors[T3_TOKENS],
        emotion_adv=EMOTION_ADV * torch.ones(1, 1, 1),
    )
    gen = {
        "prompt_token": tensors[GEN_TOKENS],
        "prompt_token_len": tensors[GEN_TOKENS_LEN],
        "prompt_feat": tensors["gen.prompt_feat"],
        "prompt_feat_len": None,
        "embedding": tensors["gen.embedding"],
    }
    return Conditionals(t3, gen).to(device)


def generate(model: Any, text: str, settings: dict[str, Any], seed: int | None = None) -> np.ndarray:
    """Speech for ``text``; inference mode keeps memory from growing across calls, a seed makes it repeatable."""
    import torch

    if seed is not None:
        torch.manual_seed(seed)
    with torch.inference_mode():
        wav = model.generate(text.translate(_QUOTES).strip() or ".", **settings)
    return np.asarray(wav.squeeze(0).detach().cpu().numpy(), dtype=np.float32)


def audition(model: Any, request: dict[str, Any]) -> list[float]:
    """Seeded samples from a conditioning, each scored against ``speakerEmb`` (cosine, voice encoder), or
    against the conditioning's own speaker when none is given (a saved voice)."""
    import librosa
    import soundfile as sf
    from chatterbox.models.s3tokenizer import S3_SR

    model.conds = load_conditioning(request["conditioning"], model.device)
    speaker = request.get("speakerEmb") or model.conds.t3.speaker_emb.detach().float().cpu().numpy().reshape(-1)
    target = _unit(np.asarray(speaker, dtype=np.float32))
    settings = sampling(request)
    scores = []
    for text, output in zip(request["texts"], request["outputs"], strict=True):
        samples = generate(model, text, settings, int(request.get("seed", 0)))
        sf.write(output, samples, model.sr, subtype="FLOAT")
        heard = _speaker(model, librosa.resample(samples, orig_sr=model.sr, target_sr=S3_SR))
        scores.append(round(float(np.dot(heard, target)), 4))
    return scores
