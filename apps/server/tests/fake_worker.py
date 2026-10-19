"""Purpose: A stand-in engine worker that speaks the JSON-lines stdio protocol, for WorkerClient tests.

Scope: Echoes requests, and simulates failures: ``fail`` (error reply), ``slow`` (exceeds timeouts),
``crash`` (process exits) and stray non-protocol output.
Does NOT belong: Any real inference.
"""

import json
import sys
import time

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
    print(json.dumps({"id": request["id"], "ok": True, "op": op}), flush=True)
