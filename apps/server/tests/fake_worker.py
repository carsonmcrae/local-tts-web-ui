"""Purpose: A stand-in engine worker that speaks the JSON-lines stdio protocol, for WorkerClient tests.

Scope: Echoes requests (``load`` reports the requested device and ``synthesize`` writes a short
silent WAV to ``output``, like the real worker), and simulates failures: ``fail`` (error reply),
``slow`` (exceeds timeouts), ``crash`` (process exits) and stray non-protocol output.
Does NOT belong: Any real inference.
"""

import json
import sys
import time
import wave

for line in sys.stdin:
    request = json.loads(line)
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
        with wave.open(request["output"], "wb") as clip:  # 0.1 s of 24 kHz silence
            clip.setnchannels(1)
            clip.setsampwidth(2)
            clip.setframerate(24_000)
            clip.writeframes(bytes(4_800))
    print(json.dumps(reply), flush=True)
