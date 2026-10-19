"""Purpose: JSON-lines worker that loads Chatterbox Turbo once and synthesises on request.

Scope: Ops ``load`` (pick cuda/mps/cpu and load verified local weights), ``synthesize`` (optional
reference recording; conditionals are cached per reference), ``ping`` and ``shutdown``. Replies go
to a private duplicate of the original stdout; everything libraries print goes to stderr. Network
access to model hubs is disabled via offline mode before any ML library is imported.
Does NOT belong: Downloads, validation of user input or file management (the server owns those).
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any

from ltts_chatterbox_worker.compat import install_pkg_resources_shim

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
# Perth (Chatterbox's watermarker) imports pkg_resources, which setuptools 81+ no longer ships.
install_pkg_resources_shim()


class Worker:
    def __init__(self) -> None:
        self.model: Any = None
        self.device = "cpu"
        self.default_conds: Any = None
        self.reference: str | None = None

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

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        import soundfile as sf

        if self.model is None:
            raise RuntimeError("model not loaded")
        reference = request.get("reference")
        if reference:
            if reference != self.reference:
                self.model.prepare_conditionals(reference)
                self.reference = reference
        else:
            self.model.conds = self.default_conds
            self.reference = None
        wav = self.model.generate(request["text"])
        samples = wav.squeeze(0).detach().cpu().numpy()
        sf.write(request["output"], samples, self.model.sr, subtype="FLOAT")
        return {"output": request["output"], "sampleRate": self.model.sr}

    def ping(self, _: dict[str, Any]) -> dict[str, Any]:
        return {"device": self.device, "loaded": self.model is not None}


def main() -> None:
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    worker = Worker()
    handlers = {"load": worker.load, "synthesize": worker.synthesize, "ping": worker.ping}
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
