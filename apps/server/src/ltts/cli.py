# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The ``ltts`` command line: serve the app, manage models, print diagnostics/OpenAPI.

Scope: ``serve`` (loopback by default; network exposure needs an explicit flag and generates an
access token), ``models ensure|verify|remove``, ``doctor`` and ``openapi``. Uses argparse only.
Does NOT belong: Application wiring (``app.py``) or bootstrap of the Python environment itself
(``scripts/*.mjs``).
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Any

from ltts import __version__
from ltts.config import Settings
from ltts.logging_setup import configure_logging

_BAR_WIDTH = 30


def _serve(args: argparse.Namespace) -> int:
    import uvicorn

    overrides: dict[str, object] = {"host": args.host}
    if args.allow_network:
        token = os.environ.get("LTTS_ACCESS_TOKEN") or secrets.token_urlsafe(24)
        overrides |= {"allow_network": True, "access_token": token}
        print(
            f"\n  Network access is ON. Other devices must open:  http://<this-computer-ip>:{args.port}/?token={token}\n"
        )
    elif args.host not in ("127.0.0.1", "localhost", "::1"):
        print("Refusing to bind a non-loopback address without --allow-network.", file=sys.stderr)
        return 2
    settings = Settings(**overrides)  # type: ignore[arg-type]
    configure_logging(settings.env)
    if args.static:
        os.environ["LTTS_STATIC_DIR"] = str(Path(args.static).resolve())
    for key, value in overrides.items():
        os.environ[f"LTTS_{key.upper()}"] = json.dumps(value) if isinstance(value, bool) else str(value)
    if args.open:
        url = f"http://127.0.0.1:{args.port}/"
        threading.Timer(1.5, webbrowser.open, args=(url,)).start()
    uvicorn.run(
        "ltts.asgi:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(Path(__file__).parent)] if args.reload else None,
        log_level="warning",
        server_header=False,
        proxy_headers=False,
        log_config=None,
    )
    return 0


_reported_quarters: set[int] = set()


def _progress(done: int, total: int, name: str) -> None:
    if not sys.stdout.isatty():
        # Logs (CI, piped output) get one line per 25 % instead of a redrawn bar.
        quarter = int(4 * done / max(total, 1))
        if quarter not in _reported_quarters:
            _reported_quarters.add(quarter)
            print(f"  {quarter * 25:3d}% ({done / 1_048_576:.0f} of {total / 1_048_576:.0f} MB)", flush=True)
        return
    filled = int(_BAR_WIDTH * done / max(total, 1))
    sys.stdout.write(f"\r  {name[:28]:<28} [{'#' * filled}{'.' * (_BAR_WIDTH - filled)}] {done / 1_048_576:7.1f} MB")
    sys.stdout.flush()


def _models(args: argparse.Namespace) -> int:
    from ltts.modelstore.store import ModelStore

    settings = Settings()
    configure_logging("production")
    store = ModelStore(settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb)
    artifact_id = {"kokoro": "kokoro-v1.0", "chatterbox": "chatterbox-turbo"}.get(args.target, args.target)
    art = store.artifact(artifact_id)
    if args.action == "ensure":
        if store.verify(artifact_id):
            print(f"✓ {art.label} is installed and verified ({settings.resolved_models_dir / artifact_id})")
            return 0
        for problem in store.damage(artifact_id, deep=True):
            print(f"! {problem.describe()}: downloading it again")
        size_mb = art.total_bytes / 1_048_576
        print(f"› Installing {art.label} ({size_mb:.0f} MB). Missing files are downloaded; all are SHA-256 verified…")
        store.install(artifact_id, _progress, lambda: False)
        print(f"\n✓ {art.label} installed and verified")
    elif args.action == "verify":
        ok = store.verify(artifact_id)
        print(("✓ verified" if ok else "✗ missing or corrupt") + f": {art.label}")
        for problem in store.damage(artifact_id, deep=True):
            print(f"  {problem.describe()}")
        return 0 if ok else 1
    else:
        store.remove(artifact_id)
        print(f"✓ removed {art.label}")
    return 0


def _doctor(_: argparse.Namespace) -> int:
    import platform

    from ltts.hardware import detect_gpus
    from ltts.modelstore.store import ModelStore
    from ltts.onnx import onnxruntime

    settings = Settings()
    store = ModelStore(settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb)
    print(f"TTSNative {__version__} — Python {platform.python_version()} on {platform.platform()}")
    print(f"Data directory:   {settings.resolved_data_dir}")
    print(f"Models directory: {settings.resolved_models_dir}")
    ort = onnxruntime()
    print(f"ONNX Runtime {ort.__version__}: {', '.join(ort.get_available_providers())}")
    gpus = detect_gpus()
    print("GPUs: " + (", ".join(f"{g.vendor} {g.name}" for g in gpus) or "none detected (CPU mode)"))
    for artifact_id, art in store.artifacts.items():
        damage = store.damage(artifact_id, deep=True)
        state = "installed, SHA-256 verified" if store.is_installed(artifact_id) and not damage else "not installed"
        if damage:
            state = "DAMAGED: " + "; ".join(item.describe() for item in damage)
            state += " (repair in Settings → Engines & models, or run npm run setup)"
        print(f"Model {art.label}: {state}")
    return 0


def _voice_ab(args: argparse.Namespace) -> int:
    """Compare two voices blind on the same sentences (``compare``), or unblind a listener's answers (``score``)."""
    from ltts.voices import ab_test

    if args.action == "score":
        print(ab_test.score(Path(args.target), Path(args.answers)).summary())
        return 0
    import soundfile as sf

    from ltts.common import utc_now
    from ltts.container import build_services

    settings = Settings()
    services = build_services(settings)
    lines = Path(args.sentences).read_text("utf-8").splitlines() if args.sentences else ab_test.DEFAULT_SENTENCES
    sentences = [line.strip() for line in lines if line.strip()][:40]
    stamp = utc_now()[:19].replace(":", "").replace("-", "")
    folder = Path(args.out) if args.out else settings.path("comparisons", stamp)

    def synthesise(voice: str, text: str) -> tuple[Any, int]:
        audio = services.synthesis.render_blocking(voice, text, "sentence", args.pace, 0, lambda: False)
        samples, rate = sf.read(audio.path, dtype="float32")
        return samples, int(rate)

    similarity = None
    if args.reference:
        builder = services.engines.voice_builder("chatterbox")
        reference = Path(args.reference)
        similarity = lambda clips: ab_test.similarity_to(builder, reference, clips)  # noqa: E731
    try:
        rows = ab_test.compare(synthesise, (args.target, args.answers), folder, sentences, args.seed, similarity)
    finally:
        for engine in services.engines.all():
            engine.close()
    print(f"Wrote {len(rows)} clips to {folder}.")
    print(f"Open {folder / 'listen.html'}, save your answers, then run: ltts voice-ab score {folder} answers.json")
    return 0


def _voice_panel(args: argparse.Namespace) -> int:
    """Write a blind listening panel from clips already made (``make``), or unblind its answers (``score``)."""
    from ltts.voices import listening_panel as panel

    if args.action == "score":
        if not args.answers:
            print("score needs the answers.json saved from the panel's page.")
            return 2
        pairs = [(a, b) for a, _, b in (pair.partition(":") for pair in args.pair)]
        print(panel.summary(*panel.score(Path(args.folder), Path(args.answers), pairs)))
        return 0
    if not args.items or len(args.voice) < 2:
        print("make needs --items and at least two --voice NAME=FOLDER.")
        return 2
    items = [panel.Item(str(i["kind"]), str(i["text"])) for i in json.loads(Path(args.items).read_text("utf-8"))]
    clips = {}
    for spec in args.voice:
        name, _, folder = spec.partition("=")
        clips[name] = [Path(folder) / f"item-{n:02d}.wav" for n in range(1, len(items) + 1)]
    panel.make(Path(args.folder), items, clips, args.seed)
    print(f"Open {Path(args.folder) / 'listen.html'}, save your answers, then run: ltts voice-panel score "
          f"{args.folder} answers.json")  # fmt: skip
    return 0


def _openapi(_: argparse.Namespace) -> int:
    from ltts.app import create_app

    app = create_app(Settings(env="development", warm_up_engines=False))
    print(json.dumps(app.openapi(), indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ltts", description="TTSNative server")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="run the API (and optionally the built UI)")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--reload", action="store_true")
    serve.add_argument("--static", help="directory with the built web UI to serve")
    serve.add_argument("--open", action="store_true", help="open the browser once started")
    serve.add_argument("--allow-network", action="store_true", help="expose to the LAN (requires a token)")
    serve.set_defaults(func=_serve)
    models = sub.add_parser("models", help="install, verify or remove model files")
    models.add_argument("action", choices=["ensure", "verify", "remove"])
    models.add_argument("target", help="kokoro, chatterbox or an artifact id")
    models.set_defaults(func=_models)
    sub.add_parser("doctor", help="print environment diagnostics").set_defaults(func=_doctor)
    sub.add_parser("openapi", help="print the OpenAPI schema").set_defaults(func=_openapi)
    ab = sub.add_parser(
        "voice-ab",
        help="blind A/B comparison of two voices",
        description="compare VOICE_A VOICE_B: read test sentences with both voices into a blind listening page; "
        "score FOLDER ANSWERS: unblind the answers saved from that page",
    )
    ab.add_argument("action", choices=["compare", "score"])
    ab.add_argument("target", help="compare: voice A's id (e.g. custom:<id>); score: the comparison folder")
    ab.add_argument("answers", help="compare: voice B's id; score: the answers.json saved from the page")
    ab.add_argument("--sentences", help="a text file with one sentence per line (default: a built-in set)")
    ab.add_argument("--reference", help="a recording of the real speaker, to measure similarity (cloning engine)")
    ab.add_argument("--out", help="where to write the comparison (default: <data>/comparisons/<time>)")
    ab.add_argument("--seed", type=int, default=0, help="shuffles which voice is X and which is Y")
    ab.add_argument("--pace", type=float, default=1.0)
    ab.set_defaults(func=_voice_ab)
    panel = sub.add_parser(
        "voice-panel",
        help="blind listening panel of several voices",
        description="make FOLDER --items items.json --voice NAME=CLIPS ...: a blind rating page from clips named "
        "item-01.wav, item-02.wav… in each CLIPS folder; score FOLDER ANSWERS [--pair A:B]: unblind the answers",
    )
    panel.add_argument("action", choices=["make", "score"])
    panel.add_argument("folder", help="where the panel is (or goes)")
    panel.add_argument("answers", nargs="?", help="score: the answers.json saved from the page")
    panel.add_argument("--items", help="make: a JSON list of {kind, text}, in the clips' order")
    panel.add_argument("--voice", action="append", default=[], help="make: NAME=FOLDER, once per voice")
    panel.add_argument("--pair", action="append", default=[], help="score: A:B, compare two voices item by item")
    panel.add_argument("--seed", type=int, default=0, help="make: shuffles the order of voices in every item")
    panel.set_defaults(func=_voice_panel)
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
