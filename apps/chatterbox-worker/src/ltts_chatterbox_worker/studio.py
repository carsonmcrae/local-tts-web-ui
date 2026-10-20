"""Purpose: Studio-voice operations: measure session takes, build a voice and audition it.

Scope: ``measure`` returns each take's speaker embeddings (voice encoder and S3Gen x-vector) and pitch
spread; ``build`` turns one prompt take plus an optional session identity into Chatterbox Turbo
conditioning and saves it as safetensors (no pickle); ``load_conditioning`` reads it back;
``audition`` generates seeded samples from a conditioning and scores each against a speaker
embedding. Mirrors ``ChatterboxTurboTTS.prepare_conditionals``: loudness-normalised reference, the
first 10 s for S3Gen's prompt and the first 15 s for T3's prompt tokens.
Does NOT belong: The JSON-lines protocol (``__main__``), ranking takes or file management (the
server owns those).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

FORMAT = "ltts-chatterbox-conditioning"
VERSION = "1"
EMOTION_ADV = 0.5  # what prepare_conditionals stores; Turbo ignores it
_LONG_KEYS = ("t3.cond_prompt_speech_tokens", "gen.prompt_token", "gen.prompt_token_len")
_SAMPLING = {"temperature": "temperature", "topP": "top_p"}  # request field -> generate() argument


def sampling(request: dict[str, Any]) -> dict[str, float]:
    """The optional sampling settings in a request, as ``generate`` keyword arguments."""
    return {argument: float(request[field]) for field, argument in _SAMPLING.items() if field in request}


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else vector


def _load(model: Any, path: str) -> tuple[np.ndarray, np.ndarray]:
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
        _, wav16 = _load(model, path)
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

    wav24, wav16 = _load(model, prompt)
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
        "t3.cond_prompt_speech_tokens": torch.atleast_2d(tokens).long().cpu(),
        "gen.prompt_token": gen["prompt_token"].long().cpu(),
        "gen.prompt_token_len": gen["prompt_token_len"].long().cpu(),
        "gen.prompt_feat": gen["prompt_feat"].float().cpu(),
        "gen.embedding": embedding,
    }
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    contiguous = {key: value.contiguous() for key, value in tensors.items()}
    save_file(contiguous, output, {"format": FORMAT, "version": VERSION})


def load_conditioning(path: str, device: str) -> Any:
    """Rebuild ``Conditionals`` with fresh, unshared tensors (synthesis caches embeddings into them)."""
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
    t3 = T3Cond(
        speaker_emb=tensors["t3.speaker_emb"],
        cond_prompt_speech_tokens=tensors["t3.cond_prompt_speech_tokens"],
        emotion_adv=EMOTION_ADV * torch.ones(1, 1, 1),
    )
    gen = {
        "prompt_token": tensors["gen.prompt_token"],
        "prompt_token_len": tensors["gen.prompt_token_len"],
        "prompt_feat": tensors["gen.prompt_feat"],
        "prompt_feat_len": None,
        "embedding": tensors["gen.embedding"],
    }
    return Conditionals(t3, gen).to(device)


def generate(model: Any, text: str, settings: dict[str, float]) -> np.ndarray:
    wav = model.generate(text, **settings)
    return np.asarray(wav.squeeze(0).detach().cpu().numpy(), dtype=np.float32)


def audition(model: Any, request: dict[str, Any]) -> list[float]:
    """Seeded samples from a conditioning, each scored against ``speakerEmb`` (cosine, voice encoder)."""
    import librosa
    import soundfile as sf
    import torch
    from chatterbox.models.s3tokenizer import S3_SR

    model.conds = load_conditioning(request["conditioning"], model.device)
    target = _unit(np.asarray(request["speakerEmb"], dtype=np.float32))
    settings = sampling(request)
    scores = []
    for text, output in zip(request["texts"], request["outputs"], strict=True):
        torch.manual_seed(int(request.get("seed", 0)))
        samples = generate(model, text, settings)
        sf.write(output, samples, model.sr, subtype="FLOAT")
        heard = _speaker(model, librosa.resample(samples, orig_sr=model.sr, target_sr=S3_SR))
        scores.append(round(float(np.dot(heard, target)), 4))
    return scores
