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
        if store.is_installed(artifact_id):
            print(f"✓ {art.label} is installed ({settings.resolved_models_dir / artifact_id})")
            return 0
        size_mb = art.total_bytes / 1_048_576
        print(f"› Installing {art.label} ({size_mb:.0f} MB). Missing files are downloaded; all are SHA-256 verified…")
        store.install(artifact_id, _progress, lambda: False)
        print(f"\n✓ {art.label} installed and verified")
    elif args.action == "verify":
        ok = store.verify(artifact_id)
        print(("✓ verified" if ok else "✗ missing or corrupt") + f": {art.label}")
        return 0 if ok else 1
    else:
        store.remove(artifact_id)
        print(f"✓ removed {art.label}")
    return 0


def _doctor(_: argparse.Namespace) -> int:
    import platform

    import onnxruntime

    from ltts.hardware import detect_gpus
    from ltts.modelstore.store import ModelStore

    settings = Settings()
    store = ModelStore(settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb)
    print(f"TTSNative {__version__} — Python {platform.python_version()} on {platform.platform()}")
    print(f"Data directory:   {settings.resolved_data_dir}")
    print(f"Models directory: {settings.resolved_models_dir}")
    print(f"ONNX Runtime {onnxruntime.__version__}: {', '.join(onnxruntime.get_available_providers())}")
    gpus = detect_gpus()
    print("GPUs: " + (", ".join(f"{g.vendor} {g.name}" for g in gpus) or "none detected (CPU mode)"))
    for artifact_id, art in store.artifacts.items():
        state = "installed" if store.is_installed(artifact_id) else "not installed"
        print(f"Model {art.label}: {state}")
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
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
