# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Fine-tune a saved studio voice on the takes it kept, and let the owner compare before keeping it.

Scope: The ``voice-tune`` job reads the voice's usable takes of known passages (their words come from
the recording script), holds out the last take of each passage group to measure progress, and trains
one epoch at a time (so progress and cancel work) until the held-out takes stop improving. It gives
up when they barely improved. The adapter waits in the profile's ``tuning`` folder with a summary and
comparison samples: the same sentences, read the way the reader reads them, without and with it.
``keep`` makes it the voice's adapter, ``discard`` drops it, and ``remove`` returns a voice to how it
was before it was fine-tuned.
Does NOT belong: Training itself (the engine and its worker), profile storage (``profiles.py``) or HTTP.
"""

from __future__ import annotations

import dataclasses
import logging
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

import numpy as np
import soundfile as sf

from ltts.common import utc_now
from ltts.engines.base import TuningTake, VoiceTuner
from ltts.errors import ConflictError, NotFoundError
from ltts.jobs import JobContext, JobManager, JobOut
from ltts.voices.profiles import CANDIDATE_FILE, TuningCandidate, VoiceProfileOut, VoiceProfileService
from ltts.voices.studio import kept_takes
from ltts.voices.styles import passage_text

log = logging.getLogger("ltts.voices.tuning")
TUNE_JOB = "voice-tune"
MAX_EPOCHS = 8
PATIENCE = 2  # epochs without a better held-out loss before training stops
MIN_TAKES = 12  # takes of known passages needed; with fewer the adapter mostly memorises them
MIN_GAIN = 0.01  # the held-out loss must drop by at least 1 % for the fine-tune to be offered
SEED = 1234
SAMPLE_TEXTS = (
    "I never expected the little bookshop on the corner to become my favourite place in town.",
    "Wait, are you serious? You finished the whole thing in one weekend?",
    "“Well, that went better than expected,” she said, laughing.",
)
Arm = Literal["current", "tuned"]


def tuning_takes(folder: Path) -> list[TuningTake]:
    """A voice's usable takes of known passages with their words; the last take of each group is held out."""
    kept = [(path, prompt_id) for path, prompt_id, _ in kept_takes(folder) if passage_text(prompt_id)]
    if len(kept) < MIN_TAKES:
        raise ConflictError(
            f"Fine-tuning needs at least {MIN_TAKES} recorded passages, and this voice kept {len(kept)}.",
            code="not_enough_takes",
        )
    groups: dict[str, list[int]] = {}
    for index, (_, prompt_id) in enumerate(kept):
        groups.setdefault(str(prompt_id).rsplit("-", 1)[0], []).append(index)
    held = {members[-1] for members in groups.values() if len(members) >= 2} or {len(kept) - 1}
    return [
        TuningTake(path, passage_text(prompt_id) or "", index in held) for index, (path, prompt_id) in enumerate(kept)
    ]


def _unit(vector: tuple[float, ...]) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float64)
    norm = float(np.linalg.norm(array))
    return array / norm if norm > 0 else array


class TuningService:
    def __init__(self, profiles: VoiceProfileService, jobs: JobManager, tuner: Callable[[], VoiceTuner]):
        self._profiles = profiles
        self._jobs = jobs
        self._tuner = tuner

    def start(self, profile_id: str) -> JobOut:
        profile = self._profiles.get(profile_id)
        if not profile.can_tune:
            raise ConflictError("Only a studio voice that kept its takes can be fine-tuned.", code="not_studio")
        if active := self._jobs.find_active(TUNE_JOB, profile_id):
            return active
        engine = self._tuner()
        return self._jobs.submit(
            TUNE_JOB, {"profileId": profile_id}, lambda ctx: self._run(ctx, profile_id, engine), key=profile_id
        )

    def _run(self, context: JobContext, profile_id: str, engine: VoiceTuner) -> dict[str, Any]:
        context.update(0.02, "Reading your takes…", force=True)
        takes = tuning_takes(self._profiles.takes_dir(profile_id))
        _, voice, _ = self._profiles.resolve(profile_id)
        if voice.conditioning_path is None:
            raise ConflictError("Only a studio voice that kept its takes can be fine-tuned.", code="not_studio")
        folder = self._profiles.tuning_dir(profile_id)
        staging = folder.with_name("tuning.new")
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        try:
            summary = self._train(context, engine, takes, voice.conditioning_path, staging / "adapter.safetensors")
            context.check()
            summary = summary.model_copy(update=self._compare(context, engine, profile_id, staging))
            (staging / CANDIDATE_FILE).write_text(summary.model_dump_json(by_alias=True), encoding="utf-8")
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        shutil.rmtree(folder, ignore_errors=True)  # a fine-tune still waiting from before is replaced
        staging.rename(folder)
        log.info("voice fine-tuned", extra={"profile_id": profile_id, "gain": summary.gain})
        return {"epochs": summary.epochs, "bestEpoch": summary.best_epoch, "gain": summary.gain}

    def _train(
        self, context: JobContext, engine: VoiceTuner, takes: list[TuningTake], conditioning: Path, output: Path
    ) -> TuningCandidate:
        """Train until the held-out takes stop improving and save the best epoch's adapter."""
        try:
            context.update(0.05, "Preparing your takes…", force=True)
            before = engine.start_tuning(takes, conditioning, MAX_EPOCHS, SEED).held_out_loss
            best, stale, epochs = before, 0, 0
            for epochs in range(1, MAX_EPOCHS + 1):
                context.check()
                context.update(
                    0.1 + 0.7 * (epochs - 1) / MAX_EPOCHS,
                    f"Fine-tuning on your takes (round {epochs} of up to {MAX_EPOCHS})…",
                    force=True,
                )
                progress = engine.tune_epoch()
                stale = 0 if progress.held_out_loss < best else stale + 1
                best = min(best, progress.held_out_loss)
                if stale >= PATIENCE:
                    break
            gain = 1 - best / before
            if gain < MIN_GAIN:
                raise ConflictError(
                    "Fine-tuning didn't bring the voice closer to your own reading, so nothing was changed.",
                    code="no_gain",
                )
            saved = engine.save_tuning(output)
        finally:
            engine.stop_tuning()
        return TuningCandidate(
            epochs=epochs,
            best_epoch=saved.best_epoch,
            loss_before=round(before, 4),
            loss_after=round(saved.held_out_loss, 4),
            gain=round(gain, 4),
            similarity_before=0.0,
            similarity_after=0.0,
            texts=list(SAMPLE_TEXTS),
            created_at=utc_now(),
        )

    def _compare(self, context: JobContext, engine: VoiceTuner, profile_id: str, folder: Path) -> dict[str, float]:
        """The sample sentences read as the reader would, without and with the adapter, and how alike they sound."""
        _, current, _ = self._profiles.resolve(profile_id)
        tuned = dataclasses.replace(current, adapter_path=folder / "adapter.safetensors")
        paths: list[Path] = []
        for index, text in enumerate(SAMPLE_TEXTS):
            for arm, voice in (("current", current), ("tuned", tuned)):
                context.check()
                context.update(0.85 + 0.13 * len(paths) / (2 * len(SAMPLE_TEXTS)), "Recording a comparison…")
                clip = engine.synthesize(text, voice, 1.0)
                path = folder / f"{arm}-{index}.wav"
                sf.write(str(path), clip.samples, clip.sample_rate, subtype="PCM_16")
                paths.append(path)
        reference = self._profiles.reference_path(profile_id)
        features = engine.measure_takes([*paths, reference])
        target = _unit(features[-1].speaker_emb)
        similarity = [float(_unit(f.speaker_emb) @ target) for f in features[:-1]]
        return {
            "similarity_before": round(float(np.mean(similarity[0::2])), 4),
            "similarity_after": round(float(np.mean(similarity[1::2])), 4),
        }

    # -- the owner's decision ---------------------------------------------
    def sample_path(self, profile_id: str, arm: Arm, index: int) -> Path:
        if self._profiles.tuning_candidate(profile_id) is None:
            raise NotFoundError("There's no fine-tune waiting to be compared.", code="tuning_not_found")
        path = self._profiles.tuning_dir(profile_id) / f"{arm}-{index}.wav"
        if not path.is_file():
            raise NotFoundError("That sample doesn't exist.", code="sample_not_found")
        return path

    def keep(self, profile_id: str) -> VoiceProfileOut:
        """Make the waiting fine-tune the voice's own; audio made before is regenerated with it."""
        self._ensure_idle(profile_id)
        if self._profiles.tuning_candidate(profile_id) is None:
            raise NotFoundError("There's no fine-tune waiting to be kept.", code="tuning_not_found")
        folder = self._profiles.tuning_dir(profile_id)
        self._profiles.set_adapter(profile_id, folder / "adapter.safetensors")
        shutil.rmtree(folder, ignore_errors=True)
        log.info("voice fine-tune kept", extra={"profile_id": profile_id})
        return self._profiles.get(profile_id)

    def discard(self, profile_id: str) -> VoiceProfileOut:
        self._ensure_idle(profile_id)
        self._profiles.get(profile_id)
        shutil.rmtree(self._profiles.tuning_dir(profile_id), ignore_errors=True)
        return self._profiles.get(profile_id)

    def remove(self, profile_id: str) -> VoiceProfileOut:
        """Stop using the kept fine-tune: the voice speaks as it did before it was fine-tuned."""
        self._ensure_idle(profile_id)
        if self._profiles.adapter_path(profile_id) is None:
            raise NotFoundError("This voice isn't fine-tuned.", code="tuning_not_found")
        self._profiles.set_adapter(profile_id, None)
        return self._profiles.get(profile_id)

    def _ensure_idle(self, profile_id: str) -> None:
        if self._jobs.find_active(TUNE_JOB, profile_id) is not None:
            raise ConflictError("This voice is being fine-tuned. Wait for it to finish.", code="voice_busy")
