# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: JSON-lines worker that loads Chatterbox Turbo once and synthesises on request.

Scope: Ops ``load`` (pick cuda/mps/cpu and load verified local weights), ``synthesize`` (optional
reference recording or saved studio conditioning with an optional style prompt, the last few kept
loaded, plus optional sampling settings and seed), the studio ops ``measure``, ``build``, ``style``
and ``audition`` (see ``studio.py``), ``ping`` and ``shutdown``. Replies go to a private duplicate
of the original stdout; everything libraries print goes to stderr. Network access to model hubs is
disabled via offline mode before any ML library is imported.
Does NOT belong: Downloads, validation of user input or file management (the server owns those).
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from collections import OrderedDict
from typing import Any

from ltts_chatterbox_worker import studio
from ltts_chatterbox_worker.compat import install_pkg_resources_shim

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
# Perth (Chatterbox's watermarker) imports pkg_resources, which setuptools 81+ no longer ships.
install_pkg_resources_shim()
LOADED_VOICES = 8  # studio voices (with their styles) kept ready, so switching per sentence is instant


class Worker:
    def __init__(self) -> None:
        self.model: Any = None
        self.device = "cpu"
        self.default_conds: Any = None
        self.voice: str | None = None  # which file the model's conditionals came from
        self.loaded: OrderedDict[str, Any] = OrderedDict()  # recently used studio conditionings

    def load(self, request: dict[str, Any]) -> dict[str, Any]:
        import torch
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        wanted = request.get("device", "auto")
        if wanted in ("auto", "cuda") and torch.cuda.is_available():
            self.device = "cuda"
        elif wanted in ("auto", "mps") and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
        self.model = ChatterboxTurboTTS.from_local(request["modelDir"], self.device)
        self.default_conds = self.model.conds
        return {"device": self.device, "torch": torch.__version__, "sampleRate": self.model.sr}

    def _loaded(self) -> Any:
        if self.model is None:
            raise RuntimeError("model not loaded")
        return self.model

    def _use_voice(self, request: dict[str, Any]) -> None:
        """Point the model at the requested voice; each file is prepared once until another is used."""
        model = self._loaded()
        conditioning, reference = request.get("conditioning"), request.get("reference")
        if conditioning:
            style = request.get("style")
            voice = f"conditioning:{conditioning}|{style or ''}"
            if voice != self.voice:
                if voice not in self.loaded:
                    self.loaded[voice] = studio.load_conditioning(conditioning, self.device, style)
                    while len(self.loaded) > LOADED_VOICES:
                        self.loaded.popitem(last=False)
                self.loaded.move_to_end(voice)
                model.conds = self.loaded[voice]
        elif reference:
            voice = f"reference:{reference}"
            if voice != self.voice:
                model.prepare_conditionals(reference)
        else:
            voice = None
            model.conds = self.default_conds
        self.voice = voice

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        import soundfile as sf

        self._use_voice(request)
        seed = request.get("seed")
        samples = studio.generate(
            self._loaded(), request["text"], studio.sampling(request), None if seed is None else int(seed)
        )
        sf.write(request["output"], samples, self.model.sr, subtype="FLOAT")
        return {"output": request["output"], "sampleRate": self.model.sr}

    def measure(self, request: dict[str, Any]) -> dict[str, Any]:
        return {"takes": studio.measure(self._loaded(), request["paths"])}

    def build(self, request: dict[str, Any]) -> dict[str, Any]:
        model = self._loaded()
        studio.build(model, request["prompt"], request["output"], request.get("speakerEmb"), request.get("xvector"))
        return {"output": request["output"]}

    def style(self, request: dict[str, Any]) -> dict[str, Any]:
        seconds = studio.build_style(self._loaded(), request["prompts"], request["output"])
        self.loaded.clear()  # a rebuilt style file must be read again
        self.voice = None
        return {"output": request["output"], "seconds": seconds}

    def audition(self, request: dict[str, Any]) -> dict[str, Any]:
        scores = studio.audition(self._loaded(), request)
        self.voice = None  # audition loads its own conditionals, outside the cache
        return {"scores": scores, "sampleRate": self.model.sr}

    def ping(self, _: dict[str, Any]) -> dict[str, Any]:
        return {"device": self.device, "loaded": self.model is not None}


def main() -> None:
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    worker = Worker()
    handlers = {
        "load": worker.load,
        "synthesize": worker.synthesize,
        "measure": worker.measure,
        "build": worker.build,
        "style": worker.style,
        "audition": worker.audition,
        "ping": worker.ping,
    }
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        if request.get("op") == "shutdown":
            break
        try:
            reply = {"id": request.get("id"), "ok": True, **handlers[request["op"]](request)}
        # Any failure is reported to the server, which maps it to a user-facing error.
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            reply = {"id": request.get("id"), "ok": False, "error": type(exc).__name__, "message": str(exc)[:300]}
        protocol.write(json.dumps(reply) + "\n")


if __name__ == "__main__":
    main()
