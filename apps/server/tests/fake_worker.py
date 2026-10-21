# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A stand-in engine worker that speaks the JSON-lines stdio protocol, for WorkerClient tests.

Scope: Echoes requests (``load`` reports the requested device and ``synthesize`` writes a tone as
long as the text would take to say, like the real worker, or a far too short one for text starting
with "CUT"), fakes the studio ops (``measure`` returns small fixed embeddings, ``build`` writes a
conditioning file naming its prompt, ``style`` a style file naming its prompts, ``audition`` writes
silent samples scored by the prompt's take number), reports every request it received (``history``), and
simulates failures: ``fail`` (error reply), ``slow`` (exceeds timeouts), ``crash`` (process exits)
and stray non-protocol output.
Does NOT belong: Any real inference.
"""

import json
import math
import re
import struct
import sys
import time
import wave
from pathlib import Path


def silence(path: str) -> None:
    with wave.open(path, "wb") as clip:  # 0.1 s of 24 kHz silence
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(24_000)
        clip.writeframes(bytes(4_800))


def speech(path: str, text: str) -> None:
    """A 220 Hz tone about as long as ``text`` takes to say (15 characters a second)."""
    seconds = 0.1 if text.startswith("CUT") else max(len(text) / 15, 0.5)
    frames = int(24_000 * seconds)
    tone = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 220 * i / 24_000))) for i in range(frames))
    with wave.open(path, "wb") as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(24_000)
        clip.writeframes(tone)


def take_number(path: str) -> int:
    digits = re.findall(r"\d+", Path(path).stem)
    return int(digits[-1]) if digits else 0


def features(path: str) -> dict:
    number = take_number(path)
    return {
        "path": path,
        "speakerEmb": [1.0, 0.1 * (number % 3), 0.0, 0.0],
        "xvector": [0.0, 1.0, 0.0],
        "pitchSpread": 1.0 + number % 4,
        "voicedRatio": 0.6,
    }


def studio(op: str, request: dict) -> dict:
    if op == "measure":
        return {"takes": [features(path) for path in request["paths"]]}
    if op == "build":
        Path(request["output"]).write_text(json.dumps({"prompt": request["prompt"]}), encoding="utf-8")
        return {"output": request["output"]}
    if op == "style":
        Path(request["output"]).write_text(json.dumps({"prompts": request["prompts"]}), encoding="utf-8")
        return {"output": request["output"], "seconds": 15.0}
    prompt = json.loads(Path(request["conditioning"]).read_text("utf-8"))["prompt"]
    for output in request["outputs"]:
        silence(output)
    return {"scores": [round(0.8 + take_number(prompt) % 10 / 100, 4)] * len(request["outputs"]), "sampleRate": 24_000}


history = []
for line in sys.stdin:
    request = json.loads(line)
    history.append(request)
    op = request.get("op")
    if op == "shutdown":
        break
    if op == "crash":
        sys.exit(3)
    if op == "slow":
        time.sleep(5)
    if op == "fail":
        print(json.dumps({"id": request["id"], "ok": False, "error": "Boom"}), flush=True)
        continue
    if op == "noisy":
        print("not json from a chatty library", flush=True)
    reply = {"id": request["id"], "ok": True, "op": op}
    if op == "load":
        reply["device"] = request.get("device")
    if op == "synthesize" and request.get("output"):
        speech(request["output"], request.get("text", ""))
    if op in ("measure", "build", "style", "audition"):
        reply.update(studio(op, request))
    if op == "history":
        reply["requests"] = history[:-1]
    print(json.dumps(reply), flush=True)
