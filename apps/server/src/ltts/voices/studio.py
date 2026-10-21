# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build a studio voice from a recorded session and turn the chosen candidate into a profile.

Scope: The ``voice-build`` job measures every usable take with the cloning engine (in batches, so
progress and cancel work), averages the speaker's identity over the takes that agree with each
other, ranks takes as prompts (speech length, noise, brightness, pauses, pitch movement and how
typical they sound), builds and auditions the best few on the same sentences with the same seed and
stores them with their match scores, then builds the speaking styles (questions, dialogue, lively
lines, narration) from the takes of matching passages. ``finish`` turns one candidate into a
profile. ``refine`` (the ``voice-styles`` job) builds the styles for a studio voice saved before
they existed, from the takes it kept.
Does NOT belong: Takes and session storage (``sessions.py``), profiles (``profiles.py``) or inference.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
from pydantic import Field

from ltts.audio import read_audio, trim_silence
from ltts.common import ApiModel
from ltts.engines.base import Audition, Delivery, SpeakerIdentity, TakeFeatures, VoiceBuilder
from ltts.errors import ConflictError, NotFoundError
from ltts.jobs import JobContext, JobManager, JobOut
from ltts.voices.profiles import StudioVoice, VoiceProfileOut, VoiceProfileService
from ltts.voices.quality import BRIGHT_DB, LEVEL_RULES, QualityReport, analyze
from ltts.voices.sessions import BUILD_JOB, CandidateOut, TakeOut, VoiceSessionService
from ltts.voices.styles import StyleTake, build_styles, prompt_for_number

log = logging.getLogger("ltts.voices.studio")
STYLES_JOB = "voice-styles"
CANDIDATES = 5
BATCH = 8
SEED = 1234
TYPICAL = 0.75  # takes less similar than this to the session's speaker are left out (noise, another voice)
MIN_PROMPT_SPEECH_S = 6.0  # the voice's sound comes from a take's first 10 s, so prefer longer takes
NOISY_SNR_DB = 12.0
AUDITION_TEXTS = (
    "I never expected the little bookshop on the corner to become my favourite place in town.",
    "Wait, are you serious? You finished the whole thing in one weekend? That's incredible!",
)


class FinishRequest(ApiModel):
    candidate: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=60)
    consent: bool
    delivery: Delivery = "natural"


def _unit(vectors: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return np.divide(vectors, norms, out=np.zeros_like(vectors), where=norms > 0)


def session_identity(features: Sequence[TakeFeatures]) -> tuple[SpeakerIdentity, npt.NDArray[np.float64]]:
    """The speaker averaged over the takes that agree with the session, and each take's similarity to it."""
    speakers = _unit(np.array([f.speaker_emb for f in features], dtype=np.float64))
    xvectors = _unit(np.array([f.xvector for f in features], dtype=np.float64))
    first = _unit(speakers.mean(axis=0))
    typical = speakers @ first >= TYPICAL
    keep = typical if typical.any() else np.ones(len(features), dtype=bool)
    speaker = _unit(speakers[keep].mean(axis=0))
    identity = SpeakerIdentity(tuple(speaker.tolist()), tuple(_unit(xvectors[keep].mean(axis=0)).tolist()))
    return identity, speakers @ speaker


def rank_prompts(
    takes: Sequence[TakeOut], features: Sequence[TakeFeatures], similarity: npt.NDArray[np.float64]
) -> list[int]:
    """Indexes of the takes best suited to give the voice its sound and style, best first."""

    def score(i: int) -> float:
        q = takes[i].quality
        bright = 0.5 if q.brightness_db is not None and q.brightness_db > BRIGHT_DB else 0.0
        return (
            min(q.speech_s, 12) / 12
            + min(q.snr_db, 40) / 40
            + min(features[i].pitch_spread, 4) / 4
            + 2 * float(similarity[i])
            - q.pause_ratio
            - bright
        )

    # Noisy takes still count towards the session's speech, but never give the voice its sound.
    clean = [i for i in range(len(takes)) if takes[i].quality.snr_db >= NOISY_SNR_DB] or list(range(len(takes)))
    typical = [i for i in clean if similarity[i] >= TYPICAL] or clean
    long_enough = [i for i in typical if takes[i].quality.speech_s >= MIN_PROMPT_SPEECH_S] or typical
    return sorted(long_enough, key=score, reverse=True)


class StudioService:
    def __init__(
        self,
        sessions: VoiceSessionService,
        profiles: VoiceProfileService,
        jobs: JobManager,
        builder: Callable[[], VoiceBuilder],
    ):
        self._sessions = sessions
        self._profiles = profiles
        self._jobs = jobs
        self._builder = builder

    def is_building(self, session_id: str) -> bool:
        return self._jobs.find_active(BUILD_JOB, session_id) is not None

    def build(self, session_id: str) -> JobOut:
        session = self._sessions.get(session_id)
        if active := self._jobs.find_active(BUILD_JOB, session_id):
            return active
        if not session.can_build:
            minutes = session.required_speech_s / 60
            raise ConflictError(
                f"Record at least {minutes:.0f} minutes of usable speech, or the foundation passage and "
                f"{session.minimum_speech_s:.0f} seconds in all, before building the voice.",
                code="not_enough_speech",
            )
        builder = self._builder()
        return self._jobs.submit(
            BUILD_JOB, {"sessionId": session_id}, lambda ctx: self._build(ctx, session_id, builder), key=session_id
        )

    def _build(self, context: JobContext, session_id: str, builder: VoiceBuilder) -> dict[str, Any]:
        usable = self._sessions.usable_takes(session_id)
        takes = [take for take, _ in usable]
        paths = [path for _, path in usable]
        features: list[TakeFeatures] = []
        for start in range(0, len(paths), BATCH):
            context.check()
            context.update(0.05 + 0.45 * start / len(paths), f"Listening to your takes ({start} of {len(paths)})…")
            features += builder.measure_takes(paths[start : start + BATCH])
        identity, similarity = session_identity(features)
        chosen = rank_prompts(takes, features, similarity)[:CANDIDATES]
        shutil.rmtree(self._sessions.folder(session_id) / "candidates", ignore_errors=True)
        candidates: list[CandidateOut] = []
        for index, take_index in enumerate(chosen):
            context.check()
            context.update(0.5 + 0.4 * index / len(chosen), f"Building and testing voice {index + 1} of {len(chosen)}…")
            candidates.append(
                self._candidate(session_id, index, takes[take_index], paths[take_index], identity, builder)
            )
        styles = build_styles(
            builder,
            _style_takes([(take.prompt_id, take.quality) for take in takes], paths, features, similarity),
            self._sessions.styles_dir(session_id),
            lambda done, total: _styles_progress(context, 0.9, done, total),
        )
        candidates.sort(key=lambda candidate: candidate.similarity, reverse=True)
        self._sessions.set_candidates(session_id, candidates)
        log.info("studio voice built", extra={"session_id": session_id, "candidates": len(candidates)})
        return {"candidates": len(candidates), "styles": styles}

    # -- styles for a saved studio voice ------------------------------------
    def refine(self, profile_id: str) -> JobOut:
        """Build the speaking styles of a studio voice from the takes it kept (for voices saved before styles)."""
        profile = self._profiles.get(profile_id)
        if profile.kind != "studio" or not self._profiles.takes_dir(profile_id).is_dir():
            raise ConflictError("Only a studio voice keeps the takes its styles are built from.", code="not_studio")
        if active := self._jobs.find_active(STYLES_JOB, profile_id):
            return active
        builder = self._builder()
        return self._jobs.submit(
            STYLES_JOB, {"profileId": profile_id}, lambda ctx: self._refine(ctx, profile_id, builder), key=profile_id
        )

    def _refine(self, context: JobContext, profile_id: str, builder: VoiceBuilder) -> dict[str, Any]:
        paths = sorted(self._profiles.takes_dir(profile_id).glob("*.flac"))
        sources: list[tuple[str | None, QualityReport]] = []
        for path in paths:
            samples, rate = read_audio(path)
            sources.append((prompt_for_number(_number(path)), analyze(trim_silence(samples, rate), rate, LEVEL_RULES)))
        usable = [i for i, (_, quality) in enumerate(sources) if quality.ok and quality.speech_s >= 2]
        if not usable:
            raise ConflictError("This voice has no usable takes left to learn its styles from.", code="no_takes")
        paths, sources = [paths[i] for i in usable], [sources[i] for i in usable]
        features: list[TakeFeatures] = []
        for start in range(0, len(paths), BATCH):
            context.check()
            context.update(0.05 + 0.55 * start / len(paths), f"Listening to your takes ({start} of {len(paths)})…")
            features += builder.measure_takes(paths[start : start + BATCH])
        _, similarity = session_identity(features)
        staging = self._profiles.styles_dir(profile_id).with_name("styles.new")
        shutil.rmtree(staging, ignore_errors=True)
        styles = build_styles(
            builder,
            _style_takes(sources, paths, features, similarity),
            staging,
            lambda done, total: _styles_progress(context, 0.6, done, total),
        )
        final, previous = self._profiles.styles_dir(profile_id), self._profiles.previous_styles_dir(profile_id)
        shutil.rmtree(previous, ignore_errors=True)  # one earlier version is kept, to go back to
        if final.is_dir():
            final.rename(previous)
        else:
            previous.mkdir()  # it had no styles before: going back means reading every sentence the same way
        staging.rename(final)
        self._profiles.styles_changed(profile_id)
        log.info("voice styles refined", extra={"profile_id": profile_id, "styles": styles})
        return {"styles": styles}

    def _candidate(
        self, session_id: str, index: int, take: TakeOut, path: Path, identity: SpeakerIdentity, builder: VoiceBuilder
    ) -> CandidateOut:
        folder = self._sessions.candidate_dir(session_id, index)
        folder.mkdir(parents=True, exist_ok=True)
        voice = folder / "voice.safetensors"
        builder.build_voice(path, voice, identity)
        outputs = [folder / f"sample-{sample}.wav" for sample in range(len(AUDITION_TEXTS))]
        scores = builder.audition(Audition(voice, AUDITION_TEXTS, outputs, identity.speaker_emb, seed=SEED))
        return CandidateOut(
            index=index,
            take_number=take.number,
            prompt_id=take.prompt_id,
            similarity=round(float(np.mean(scores)), 4),
            samples=len(outputs),
        )

    def sample_path(self, session_id: str, index: int, sample: int) -> Path:
        self._candidate_of(session_id, index)
        path = self._sessions.candidate_dir(session_id, index) / f"sample-{sample}.wav"
        if not path.is_file():
            raise NotFoundError("That sample doesn't exist.", code="sample_not_found")
        return path

    def finish(self, session_id: str, request: FinishRequest) -> VoiceProfileOut:
        """Save the chosen candidate as a studio voice; the session's takes move to the new profile."""
        if self.is_building(session_id):
            raise ConflictError("This session's voice is being built. Wait for it to finish.", code="session_busy")
        candidate = self._candidate_of(session_id, request.candidate)
        session = self._sessions.get(session_id)
        take = next(t for t in session.takes if t.number == candidate.take_number)
        profile = self._profiles.create_studio(
            StudioVoice(
                name=request.name.strip(),
                reference=self._sessions.build_audio(session_id, take.number),
                voice=self._sessions.candidate_dir(session_id, candidate.index) / "voice.safetensors",
                takes=self._sessions.folder(session_id) / "takes",
                quality=take.quality,
                speech_s=session.usable_speech_s,
                delivery=request.delivery,
                styles=self._sessions.styles_dir(session_id),
            ),
            request.consent,
        )
        self._sessions.delete(session_id)
        return profile

    def _candidate_of(self, session_id: str, index: int) -> CandidateOut:
        candidates = self._sessions.get(session_id).candidates
        found = next((c for c in candidates if c.index == index), None)
        if found is None:
            raise NotFoundError("Build the voice first, then choose one of the results.", code="candidate_not_found")
        return found


def _number(path: Path) -> int:
    return int(path.stem) if path.stem.isdigit() else 0


def _style_takes(
    sources: Sequence[tuple[str | None, QualityReport]],
    paths: Sequence[Path],
    features: Sequence[TakeFeatures],
    similarity: npt.NDArray[np.float64],
) -> list[StyleTake]:
    return [
        StyleTake(path, prompt_id, quality, feature.pitch_spread, bool(similarity[i] >= TYPICAL))
        for i, ((prompt_id, quality), path, feature) in enumerate(zip(sources, paths, features, strict=True))
    ]


def _styles_progress(context: JobContext, start: float, done: int, total: int) -> None:
    context.check()
    context.update(
        start + (0.99 - start) * done / total, "Teaching the voice your questions, dialogue and lively lines…"
    )
