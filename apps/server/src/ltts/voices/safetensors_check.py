# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Check that a shared voice file is exactly the kind of safetensors file the app writes.

Scope: Reads only the safetensors header (an 8-byte length, then JSON) and compares it with the
file: its metadata names the expected format and version, every tensor has an allowed name, type
and a bounded shape, and the tensors' byte ranges exactly tile the data that follows. No tensor is
loaded and no code runs; safetensors cannot hold code, and this rejects anything malformed or
unexpected before the cloning engine ever reads it.
Does NOT belong: Writing or loading voices (the Chatterbox worker) or the package itself (``sharing.py``).
"""

from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

from ltts.errors import UnsupportedDocumentError

MAX_HEADER_BYTES = 64 * 1024
MAX_DIM = 8_192
MAX_ELEMENTS = 4_000_000
_ITEM_BYTES = {"F32": 4, "F16": 2, "BF16": 2, "I64": 8, "I32": 4}


@dataclass(frozen=True, slots=True)
class TensorRule:
    dtypes: frozenset[str]
    max_rank: int


_FLOAT = TensorRule(frozenset({"F32", "F16", "BF16"}), 3)
_TOKENS = TensorRule(frozenset({"I64", "I32"}), 2)
CONDITIONING = (
    "ltts-chatterbox-conditioning",
    "1",
    {
        "t3.speaker_emb": _FLOAT,
        "t3.cond_prompt_speech_tokens": _TOKENS,
        "gen.prompt_token": _TOKENS,
        "gen.prompt_token_len": _TOKENS,
        "gen.prompt_feat": _FLOAT,
        "gen.embedding": _FLOAT,
    },
)
STYLE = ("ltts-chatterbox-style", "1", {"t3.cond_prompt_speech_tokens": _TOKENS})
Kind = tuple[str, str, dict[str, TensorRule]]


def _reject(what: str) -> UnsupportedDocumentError:
    return UnsupportedDocumentError(f"This voice file isn't valid: {what}.", code="invalid_voice_file")


def check_safetensors(path: Path, kind: Kind) -> None:
    """Raise ``invalid_voice_file`` unless ``path`` holds exactly the tensors ``kind`` allows, and nothing else."""
    fmt, version, rules = kind
    header, data_bytes = _read_header(path)
    meta = header.pop("__metadata__", None)
    if not isinstance(meta, dict) or meta.get("format") != fmt or meta.get("version") != version:
        raise _reject("it was made by another program or version")
    if set(header) != set(rules):
        raise _reject("it holds unexpected or missing parts")
    position = 0
    for start, end in sorted(_check_tensor(name, info, rules[name]) for name, info in header.items()):
        if start != position:
            raise _reject("its data has gaps or overlaps")
        position = end
    if position != data_bytes:
        raise _reject("its data doesn't match its header")


def _read_header(path: Path) -> tuple[dict[str, object], int]:
    """The parsed JSON header and how many bytes of tensor data follow it."""
    size = path.stat().st_size
    with path.open("rb") as handle:
        prefix = handle.read(8)
        if len(prefix) != 8:
            raise _reject("it is empty")
        (length,) = struct.unpack("<Q", prefix)
        if not 2 <= length <= min(MAX_HEADER_BYTES, size - 8):
            raise _reject("its header has the wrong size")
        try:
            header = json.loads(handle.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise _reject("its header can't be read") from exc
    if not isinstance(header, dict):
        raise _reject("its header can't be read")
    return header, size - 8 - length


def _check_tensor(name: str, info: object, rule: TensorRule) -> tuple[int, int]:
    if not isinstance(info, dict) or set(info) != {"dtype", "shape", "data_offsets"}:
        raise _reject(f"the part {name} is malformed")
    dtype, shape, offsets = info["dtype"], info["shape"], info["data_offsets"]
    if dtype not in rule.dtypes:
        raise _reject(f"the part {name} has the wrong type")
    valid_shape = isinstance(shape, list) and 1 <= len(shape) <= rule.max_rank
    if not valid_shape or not all(type(d) is int and 0 < d <= MAX_DIM for d in shape):
        raise _reject(f"the part {name} has the wrong shape")
    elements = math.prod(shape)
    if elements > MAX_ELEMENTS:
        raise _reject(f"the part {name} is too large")
    if not (isinstance(offsets, list) and len(offsets) == 2 and all(type(o) is int for o in offsets)):
        raise _reject(f"the part {name} is malformed")
    start, end = offsets
    if not 0 <= start <= end or end - start != elements * _ITEM_BYTES[dtype]:
        raise _reject(f"the part {name} doesn't match its size")
    return start, end
