# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Where a studio voice keeps its fine-tune, and one waiting to be compared.

Scope: The kept adapter is ``adapter-<id>.safetensors`` in the profile folder, with a new id each time
one is kept, so its name can be part of the audio cache revision. A waiting fine-tune is the ``tuning``
folder's adapter plus ``candidate.json`` (``TuningCandidate``), read only when both are there.
Does NOT belong: Training (``tuning.py``), the rest of a profile (``profiles.py``) or HTTP.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from ltts.common import ApiModel, new_id

CANDIDATE_FILE = "candidate.json"
CANDIDATE_ADAPTER = "adapter.safetensors"


class TuningCandidate(ApiModel):
    """A finished fine-tune waiting for the owner to compare it with the voice as it is, and keep it or not."""

    epochs: int  # epochs trained (training stops once the held-out takes stop improving)
    best_epoch: int
    loss_before: float  # mean loss per speech token on held-out takes: how surprised the model is by them
    loss_after: float
    gain: float  # relative drop in that loss (0.05 = 5 % closer to the held-out takes)
    similarity_before: float  # how much the comparison sentences sound like the speaker, without and with it
    similarity_after: float
    texts: list[str]  # the comparison sentences; samples are served per sentence, without and with it
    created_at: str


def kept_adapter(folder: Path) -> Path | None:
    """The adapter a voice speaks with, if it kept one."""
    return next(iter(sorted(folder.glob("adapter-*.safetensors"))), None)


def replace_adapter(folder: Path, source: Path | None) -> None:
    """Keep the adapter at ``source`` (moved under a new name), or none; the one kept before is removed."""
    old = kept_adapter(folder)
    if source is not None:
        shutil.move(source, folder / f"adapter-{new_id()[:12]}.safetensors")
    if old is not None:
        old.unlink(missing_ok=True)


def waiting_candidate(folder: Path) -> TuningCandidate | None:
    """The fine-tune waiting in a ``tuning`` folder, when both its adapter and its summary are there."""
    if not (folder / CANDIDATE_ADAPTER).is_file() or not (folder / CANDIDATE_FILE).is_file():
        return None
    try:
        return TuningCandidate.model_validate_json((folder / CANDIDATE_FILE).read_text(encoding="utf-8"))
    except ValueError:
        return None
