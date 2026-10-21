# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Fine-tune a studio voice: a small LoRA adapter on Chatterbox Turbo's T3, trained on the
voice's own takes and applied whenever that voice speaks.

Scope: ``Tuning`` trains the adapter (low-rank updates to the attention and MLP projections of every
GPT-2 block) on whole takes and their passage text, framed exactly like ``T3.inference_turbo``: the
speaker and a 15 s prompt, the text's tokens, start-of-speech, then the take's speech tokens and a
stop token. Each take is prompted by the voice's own prompt or a style-like prompt joined from three
other takes (never itself). After every epoch it scores the held-out takes and keeps the best epoch,
which ``save`` writes as bf16 safetensors. Synthesis still works while it trains: the adapter being
trained is switched off, or swapped for the requested voice's. ``Adapters`` applies a saved adapter
by merging it into T3's weights (synthesis at full speed) and restores the original weights exactly,
from a copy taken before the first merge, when a voice without it (or with another) speaks.
Does NOT belong: Choosing takes, held-out takes or when to stop (the server), the protocol (``__main__``).
"""

from __future__ import annotations

import contextlib
import functools
import math
import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np

from ltts_chatterbox_worker import studio

FORMAT = "ltts-chatterbox-adapter"
VERSION = "1"
RANK = 16
ALPHA = 32.0
SCALE = ALPHA / RANK
DROPOUT = 0.05
LEARNING_RATE = 2e-4
ACCUMULATE = 4  # takes per optimiser step (each forward pass is one take)
PROMPTS = 40  # style-like prompts drawn for a run, each joined from PROMPT_TAKES takes
PROMPT_TAKES = 3
TARGETS = ("attn.c_attn", "attn.c_proj", "mlp.c_fc", "mlp.c_proj")
EDGE_S = 0.1  # silence kept at a take's edges
MAX_PAUSE_S = 0.8  # longer pauses inside a take are shortened (synthesis shortens them anyway)
MAX_SPEECH_TOKENS = 900  # 36 s at 25 tokens a second; longer takes are skipped
VOICE_PROMPT_MATCH = 0.5  # a take whose opening matches the voice's own prompt this well gave it that prompt
_QUOTES = str.maketrans("", "", '"“”')


def _tidy(wav16: np.ndarray, sample_rate: int) -> np.ndarray:
    """A take with its edges trimmed to ``EDGE_S`` and its pauses cut to at most ``MAX_PAUSE_S``.

    Speech is any 20 ms frame 30 % of the way from the noise floor to the loud end of the take (a
    fixed level below the peak would count breaths and room noise as speech).
    """
    frame = max(sample_rate // 50, 1)
    usable = len(wav16) - len(wav16) % frame
    if usable == 0:
        return wav16
    frames = wav16[:usable].reshape(-1, frame)
    level = 20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-9)
    floor, loud = np.percentile(level, [5, 90])
    voiced = level > floor + 0.3 * (loud - floor)
    indexes = np.nonzero(voiced)[0]
    if indexes.size == 0:
        return wav16[:0]
    edge, longest = round(EDGE_S * 50), round(MAX_PAUSE_S * 50)
    keep = np.zeros(len(voiced), dtype=bool)
    keep[max(indexes[0] - edge, 0) : indexes[-1] + edge + 1] = True
    run = 0
    for index, is_voiced in enumerate(voiced):
        run = 0 if is_voiced else run + 1
        if run > longest:
            keep[index] = False
    return np.asarray(frames[keep].reshape(-1), dtype=np.float32)


def _layers(model: Any) -> dict[str, Any]:
    """The targeted GPT-2 projections by name (``Conv1D``: ``x @ weight + bias``, weight is [in, out])."""
    layers = {}
    for index, block in enumerate(model.t3.tfmr.h):
        for target in TARGETS:
            parent, name = target.split(".")
            module = getattr(getattr(block, parent), name)
            layers[f"tfmr.h.{index}.{target}"] = getattr(module, "base", module)  # under a training wrapper
    return layers


def read_adapter(path: str, layers: dict[str, Any]) -> dict[str, tuple[Any, Any]]:
    """An adapter file's low-rank pairs (``a``: [rank, in], ``b``: [out, rank]), checked against the model."""
    from safetensors import safe_open
    from safetensors.torch import load_file

    with safe_open(path, framework="pt") as handle:
        meta = handle.metadata() or {}
    if (meta.get("format"), meta.get("version"), meta.get("rank"), meta.get("alpha")) != (
        FORMAT,
        VERSION,
        str(RANK),
        str(ALPHA),
    ):
        raise ValueError("Unsupported voice adapter file")
    tensors = load_file(path, device="cpu")
    if set(tensors) != {f"{name}.{part}" for name in layers for part in ("lora_a", "lora_b")}:
        raise ValueError("Voice adapter doesn't match the model")
    pairs = {}
    for name, layer in layers.items():
        n_in, n_out = layer.weight.shape
        a, b = tensors[f"{name}.lora_a"], tensors[f"{name}.lora_b"]
        if tuple(a.shape) != (RANK, n_in) or tuple(b.shape) != (n_out, RANK):
            raise ValueError("Voice adapter doesn't match the model")
        pairs[name] = (a.float(), b.float())
    return pairs


class Adapters:
    """Which adapter is merged into T3 now, and a copy of the original weights to restore exactly."""

    def __init__(self) -> None:
        self.current: str | None = None
        self._original: dict[str, Any] | None = None

    def use(self, model: Any, path: str | None) -> None:
        if path == self.current:
            return
        import torch

        layers = _layers(model)
        pairs = read_adapter(path, layers) if path else None  # checked before any weight changes
        with torch.no_grad():
            if self.current is not None and self._original is not None:
                for name, layer in layers.items():
                    layer.weight.copy_(self._original[name])
                self.current = None
            if pairs is not None:
                if self._original is None:
                    self._original = {
                        name: layer.weight.detach().to("cpu", copy=True) for name, layer in layers.items()
                    }
                self.current = path  # set first, so a failure part-way is still restored next time
                for name, layer in layers.items():
                    a, b = (tensor.to(layer.weight.device) for tensor in pairs[name])
                    layer.weight.add_((b @ a).t().to(layer.weight.dtype) * SCALE)


@functools.cache
def _wrapper_class() -> type:
    import torch
    from torch import nn

    class LoRA(nn.Module):
        """A frozen projection plus a trainable low-rank update, or another adapter's while serving."""

        def __init__(self, base: Any) -> None:
            super().__init__()
            self.base = base
            n_in, n_out = base.weight.shape
            device = base.weight.device
            self.lora_a = nn.Parameter(torch.empty(RANK, n_in, device=device))
            self.lora_b = nn.Parameter(torch.zeros(n_out, RANK, device=device))  # starts as a no-op
            nn.init.kaiming_uniform_(self.lora_a, a=math.sqrt(5))
            self.drop = nn.Dropout(DROPOUT)
            self.active = True
            self.serving: tuple[Any, Any] | None = None

        def forward(self, x: Any) -> Any:
            out = self.base(x)
            if self.serving is not None:
                a, b = self.serving
                return out + (x @ a.t() @ b.t()) * SCALE
            if not self.active:
                return out
            return out + (self.drop(x) @ self.lora_a.t() @ self.lora_b.t()) * SCALE

    return LoRA


class Tuning:
    """One fine-tuning run: the takes as tokens, the adapter being trained and its best epoch so far."""

    def __init__(self, model: Any, request: dict[str, Any]) -> None:
        import torch

        if model.device != "cuda":
            raise RuntimeError("Fine-tuning needs an NVIDIA graphics card (CUDA)")
        self.model = model
        seed = int(request.get("seed", 0))
        self.rng = random.Random(seed)
        torch.manual_seed(seed)
        conds = studio.load_conditioning(request["conditioning"], "cpu")
        self.speaker = conds.t3.speaker_emb.float()
        voice_prompt = conds.t3.cond_prompt_speech_tokens.long()[0]
        self.train: list[dict[str, Any]] = []
        self.held: list[dict[str, Any]] = []
        sources: dict[int, np.ndarray] = {}
        voice_take: int | None = None
        for index, take in enumerate(request["takes"]):
            wav16 = studio.load_take(model, take["path"])[1]
            sample = self._sample(wav16, take["text"])
            if sample is None:
                continue
            (self.held if take.get("heldOut") else self.train).append({**sample, "take": index})
            if not take.get("heldOut"):
                sources[index] = wav16
            opening = self._tokens(wav16[: model.ENC_COND_LEN], model.t3.hp.speech_cond_prompt_len)
            n = min(len(opening), len(voice_prompt))
            if n and float((opening[:n] == voice_prompt[:n]).float().mean()) >= VOICE_PROMPT_MATCH:
                voice_take = index
        if not self.train or not self.held:
            raise ValueError("Not enough usable takes to fine-tune")
        self.prompts = [(frozenset() if voice_take is None else frozenset([voice_take]), voice_prompt)]
        for _ in range(PROMPTS):
            chosen = self.rng.sample(sorted(sources), min(PROMPT_TAKES, len(sources)))
            tokens, _ = studio.prompt_tokens(model, [sources[i] for i in chosen])
            self.prompts.append((frozenset(chosen), tokens[0]))
        self.checks = [tokens for _, tokens in self.prompts[:3]]  # held-out takes are never in a prompt
        self.epochs = int(request["epochs"])
        self.wrappers: dict[str, Any] = {}
        self._frozen = {name: p.requires_grad for name, p in model.t3.named_parameters()}
        self._served: tuple[str, dict[str, tuple[Any, Any]]] | None = None
        try:
            self._wrap()
            self.epoch = 0
            self.base_loss = self._held_out_loss()
            self.best: tuple[float, int, dict[str, Any] | None] = (self.base_loss, 0, None)
        except Exception:
            self.close()
            raise

    def summary(self) -> dict[str, Any]:
        return {"samples": len(self.train), "heldOut": len(self.held), "baseLoss": round(self.base_loss, 4)}

    # -- data ---------------------------------------------------------------
    def _tokens(self, wav16: np.ndarray, max_len: int | None = None) -> Any:
        import torch

        with torch.inference_mode():
            tokens, _ = self.model.s3gen.tokenizer.forward([wav16], max_len=max_len)
        return torch.atleast_2d(tokens)[0].long().cpu()  # outside inference mode: usable in training

    def _sample(self, wav16: np.ndarray, text: str) -> dict[str, Any] | None:
        """A take as training tokens, prepared exactly as synthesis prepares a sentence's text."""
        from chatterbox.models.s3tokenizer import S3_SR
        from chatterbox.tts_turbo import punc_norm

        words = text.translate(_QUOTES).strip()
        speech = self._tokens(_tidy(wav16, S3_SR))
        if not words or not 0 < len(speech) <= MAX_SPEECH_TOKENS:
            return None
        tokens = self.model.tokenizer(punc_norm(words), return_tensors="pt").input_ids[0].long()
        return {"text": tokens, "speech": speech}

    # -- training -----------------------------------------------------------
    def _wrap(self) -> None:
        import torch
        from torch.utils.checkpoint import checkpoint

        t3 = self.model.t3
        for parameter in t3.parameters():
            parameter.requires_grad_(False)
        wrapper = _wrapper_class()
        for index, block in enumerate(t3.tfmr.h):
            for target in TARGETS:
                parent, name = target.split(".")
                module = wrapper(getattr(getattr(block, parent), name))
                setattr(getattr(block, parent), name, module)
                self.wrappers[f"tfmr.h.{index}.{target}"] = module
        self.parameters = [p for module in self.wrappers.values() for p in (module.lora_a, module.lora_b)]
        self.optimizer = torch.optim.AdamW(self.parameters, lr=LEARNING_RATE, weight_decay=0.0)
        steps = math.ceil(len(self.train) / ACCUMULATE) * self.epochs
        warmup = max(1, steps // 10)
        self.schedule = torch.optim.lr_scheduler.LambdaLR(
            self.optimizer, lambda step: min(1.0, (step + 1) / warmup) * max(0.0, 1 - step / steps)
        )
        # Not gradient_checkpointing_enable(): it looks for the input embeddings Turbo deletes (tfmr.wte).
        t3.tfmr._set_gradient_checkpointing(
            enable=True, gradient_checkpointing_func=functools.partial(checkpoint, use_reentrant=False)
        )

    def _loss(self, prompt: Any, sample: dict[str, Any]) -> Any:
        """Next-token loss on a take's speech tokens, conditioned like ``T3.inference_turbo``."""
        import torch
        import torch.nn.functional as F
        from chatterbox.models.t3.modules.cond_enc import T3Cond

        t3 = self.model.t3
        device = t3.device
        cond = T3Cond(
            speaker_emb=self.speaker.to(device),
            cond_prompt_speech_tokens=prompt[None].to(device),
            emotion_adv=studio.EMOTION_ADV * torch.ones(1, 1, 1, device=device),
        )
        cond_emb = t3.prepare_conditioning(cond)
        text_emb = t3.text_emb(sample["text"][None].to(device))
        speech = sample["speech"].to(device)
        start = torch.full((1, 1), t3.hp.start_speech_token, device=device)
        embeds = torch.cat([cond_emb, text_emb, t3.speech_emb(torch.cat([start, speech[None]], dim=1))], dim=1)
        hidden = t3.tfmr(inputs_embeds=embeds, use_cache=False).last_hidden_state
        logits = t3.speech_head(hidden[:, cond_emb.size(1) + text_emb.size(1) :])
        target = torch.cat([speech, torch.tensor([t3.hp.stop_speech_token], device=device)])
        return F.cross_entropy(logits[0].float(), target)

    def _held_out_loss(self) -> float:
        """Mean loss per speech token on the held-out takes, under the voice's own prompt and two others."""
        import torch

        self.model.t3.eval()
        total, count = 0.0, 0
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
            for sample in self.held:
                for prompt in self.checks:
                    tokens = len(sample["speech"]) + 1
                    total += float(self._loss(prompt, sample)) * tokens
                    count += tokens
        return total / count

    def run_epoch(self) -> dict[str, Any]:
        import torch

        self.model.t3.train()
        order = list(range(len(self.train)))
        self.rng.shuffle(order)
        total = 0.0
        for step, index in enumerate(order, start=1):
            sample = self.train[index]
            prompts = [tokens for takes, tokens in self.prompts if sample["take"] not in takes]
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = self._loss(self.rng.choice(prompts or [self.prompts[0][1]]), sample)
            (loss / ACCUMULATE).backward()
            total += float(loss.detach())
            if step % ACCUMULATE == 0 or step == len(order):
                torch.nn.utils.clip_grad_norm_(self.parameters, 1.0)
                self.optimizer.step()
                self.schedule.step()
                self.optimizer.zero_grad(set_to_none=True)
        self.epoch += 1
        held = self._held_out_loss()
        if held < self.best[0]:
            self.best = (held, self.epoch, self._state())
        return {
            "epoch": self.epoch,
            "trainLoss": round(total / len(order), 4),
            "heldOutLoss": round(held, 4),
            "bestEpoch": self.best[1],
        }

    def _state(self) -> dict[str, Any]:
        import torch

        state = {}
        for name, module in self.wrappers.items():
            state[f"{name}.lora_a"] = module.lora_a.detach().to("cpu", torch.bfloat16, copy=True).contiguous()
            state[f"{name}.lora_b"] = module.lora_b.detach().to("cpu", torch.bfloat16, copy=True).contiguous()
        return state

    def save(self, output: str) -> dict[str, Any]:
        from safetensors.torch import save_file

        loss, epoch, state = self.best
        if state is None:
            raise RuntimeError("No epoch improved on the voice")
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        meta = {"format": FORMAT, "version": VERSION, "rank": str(RANK), "alpha": str(ALPHA)}
        save_file(state, output, meta | {"targets": ",".join(TARGETS), "epoch": str(epoch)})
        return {"output": output, "epoch": epoch, "heldOutLoss": round(loss, 4), "baseLoss": round(self.base_loss, 4)}

    # -- synthesis while training ------------------------------------------
    @contextlib.contextmanager
    def serving(self, path: str | None) -> Iterator[None]:
        """Synthesis between epochs: the adapter being trained is switched off, or replaced by ``path``'s."""
        pairs = None
        if path:
            if self._served is None or self._served[0] != path:
                bases = {name: module.base for name, module in self.wrappers.items()}
                self._served = (path, read_adapter(path, bases))
            pairs = self._served[1]
        t3 = self.model.t3
        training = t3.training
        t3.eval()
        for name, module in self.wrappers.items():
            module.active = False
            if pairs is not None:
                module.serving = tuple(tensor.to(module.base.weight.device) for tensor in pairs[name])
        try:
            yield
        finally:
            for module in self.wrappers.values():
                module.active, module.serving = True, None
            t3.train(training)

    def close(self) -> None:
        """Put the original projections back and free the training state."""
        import torch

        t3 = self.model.t3
        t3.tfmr._set_gradient_checkpointing(enable=False)
        for index, block in enumerate(t3.tfmr.h):
            for target in TARGETS:
                parent, name = target.split(".")
                module = getattr(getattr(block, parent), name)
                setattr(getattr(block, parent), name, getattr(module, "base", module))
        for name, parameter in t3.named_parameters():
            parameter.requires_grad_(self._frozen.get(name, parameter.requires_grad))
        t3.eval()
        self.wrappers.clear()
        self.parameters = []
        self._served = None
        if hasattr(self, "optimizer"):
            del self.optimizer, self.schedule
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
