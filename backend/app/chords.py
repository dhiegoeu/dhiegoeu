"""Chord recognition from audio.

Pipeline: harmonic separation -> tuning-corrected CQT chromagram -> beat-synchronous
aggregation -> template matching (maj / min / 7 / m7) with a bonus for chords that belong
to the detected key -> Viterbi smoothing so chords do not flicker.

This is a classic signal-processing approach. It is good on guitar/piano/band recordings
with clear harmony and gets less reliable with heavy distortion, dense mixes or
non-Western harmony.
"""

from __future__ import annotations

from dataclasses import dataclass

import librosa
import numpy as np

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Chord quality -> semitone intervals from the root.
QUALITIES: dict[str, tuple[int, ...]] = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "m7": (0, 3, 7, 10),
}
# Extended chords need clear evidence, otherwise a plain triad wins.
QUALITY_PENALTY = {"": 0.0, "m": 0.0, "7": 0.06, "m7": 0.06}

# Krumhansl-Schmuckler key profiles.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Keys that are conventionally written with flats (pitch class of the tonic, mode).
FLAT_MAJOR_TONICS = {5, 10, 3, 8, 1}  # F Bb Eb Ab Db
FLAT_MINOR_TONICS = {2, 7, 0, 5, 10, 3}  # Dm Gm Cm Fm Bbm Ebm

SR = 22050
HOP = 2048
DIATONIC_BONUS = 0.05
STAY_PROBABILITY = 0.82
EMISSION_SHARPNESS = 14.0


@dataclass
class ChordSegment:
    start: float
    end: float
    chord: str


@dataclass
class KeyResult:
    tonic: int
    minor: bool
    confidence: float

    @property
    def name(self) -> str:
        names = FLAT_NAMES if self.prefers_flats else SHARP_NAMES
        return names[self.tonic] + ("m" if self.minor else "")

    @property
    def prefers_flats(self) -> bool:
        return self.tonic in (FLAT_MINOR_TONICS if self.minor else FLAT_MAJOR_TONICS)


def _build_templates() -> tuple[np.ndarray, list[tuple[int, str]]]:
    templates, labels = [], []
    for quality, intervals in QUALITIES.items():
        for root in range(12):
            vec = np.zeros(12)
            for interval in intervals:
                vec[(root + interval) % 12] = 1.0
            vec[root] += 0.4  # roots carry more weight than other chord tones
            templates.append(vec / np.linalg.norm(vec))
            labels.append((root, quality))
    return np.array(templates), labels


TEMPLATES, LABELS = _build_templates()
PENALTIES = np.array([QUALITY_PENALTY[q] for _, q in LABELS])


def detect_key(chroma: np.ndarray) -> KeyResult:
    """Estimate the global key from a (12, n) chromagram."""
    profile = chroma.mean(axis=1)
    best = (-2.0, 0, False)
    scores = []
    for tonic in range(12):
        for minor, ref in ((False, MAJOR_PROFILE), (True, MINOR_PROFILE)):
            r = np.corrcoef(profile, np.roll(ref, tonic))[0, 1]
            scores.append(r)
            if r > best[0]:
                best = (r, tonic, minor)
    scores.sort(reverse=True)
    confidence = float(best[0] - scores[1]) if len(scores) > 1 else 0.0
    return KeyResult(tonic=best[1], minor=best[2], confidence=confidence)


def _diatonic_mask(key: KeyResult) -> np.ndarray:
    """Boolean mask over LABELS for chords that belong to the key."""
    if key.minor:
        # natural minor + the major V (harmonic minor) + their seventh variants
        scale = [(0, "m"), (3, ""), (5, "m"), (7, "m"), (7, ""), (8, ""), (10, "")]
        sevenths = {(0, "m7"), (5, "m7"), (7, "m7"), (7, "7"), (10, "7")}
    else:
        scale = [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m")]
        sevenths = {(2, "m7"), (4, "m7"), (9, "m7"), (7, "7")}
    allowed = {((key.tonic + d) % 12, q) for d, q in scale}
    allowed |= {((key.tonic + d) % 12, q) for d, q in sevenths}
    return np.array([(root, q) in allowed for root, q in LABELS])


def chord_name(root: int, quality: str, flats: bool) -> str:
    return (FLAT_NAMES if flats else SHARP_NAMES)[root] + quality


def _beat_boundaries(y: np.ndarray, n_frames: int) -> np.ndarray:
    """Chroma-frame indices that delimit analysis windows (beats, or fixed windows)."""
    try:
        _, beats = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP)
        beats = np.asarray(beats, dtype=int)
    except Exception:  # noqa: BLE001 - beat tracking is best-effort
        beats = np.array([], dtype=int)
    if len(beats) < 8:
        step = max(1, int(round(0.5 * SR / HOP)))
        beats = np.arange(0, n_frames, step)
    # Chords rarely change every beat; use pairs of beats for a steadier signal.
    beats = beats[::2] if len(beats) > 64 else beats
    return librosa.util.fix_frames(beats, x_min=0, x_max=n_frames)


def recognize_chords(path: str, progress=None) -> tuple[list[ChordSegment], KeyResult, float]:
    """Return (chord segments, estimated key, duration in seconds) for an audio file."""
    y, _ = librosa.load(path, sr=SR, mono=True)
    duration = len(y) / SR
    if duration < 1.0 or float(np.max(np.abs(y))) < 1e-4:
        return [], KeyResult(0, False, 0.0), duration

    if progress:
        progress("Separando a parte harmônica")
    y_harm = librosa.effects.harmonic(y, margin=4.0)
    tuning = librosa.estimate_tuning(y=y_harm, sr=SR)

    if progress:
        progress("Calculando cromagrama")
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=SR, hop_length=HOP, tuning=tuning, n_chroma=12)
    energy = chroma.sum(axis=0)

    boundaries = _beat_boundaries(y, chroma.shape[1])
    chroma_sync = librosa.util.sync(chroma, boundaries, aggregate=np.median)
    energy_sync = librosa.util.sync(energy[np.newaxis, :], boundaries, aggregate=np.mean)[0]
    n_steps = chroma_sync.shape[1]

    key = detect_key(chroma_sync)
    flats = key.prefers_flats

    norms = np.linalg.norm(chroma_sync, axis=0)
    unit = chroma_sync / np.maximum(norms, 1e-9)
    scores = TEMPLATES @ unit  # (n_chords, n_steps), cosine similarity
    scores = scores - PENALTIES[:, None]
    scores = scores + DIATONIC_BONUS * _diatonic_mask(key)[:, None]

    # Extra "no chord" state for silence.
    silent = energy_sync < 0.15 * np.median(energy_sync[energy_sync > 0]) if np.any(energy_sync > 0) else np.ones(n_steps, bool)
    n_state = np.where(silent, 1.0, 0.0)[None, :]
    scores = np.vstack([scores, n_state])
    scores[:-1, silent] = 0.0

    probs = np.exp(EMISSION_SHARPNESS * (scores - scores.max(axis=0, keepdims=True)))
    probs /= probs.sum(axis=0, keepdims=True)
    transition = librosa.sequence.transition_loop(probs.shape[0], STAY_PROBABILITY)
    states = librosa.sequence.viterbi(probs, transition)

    times = librosa.frames_to_time(boundaries, sr=SR, hop_length=HOP)
    times[-1] = max(times[-1], duration) if len(times) else duration

    segments: list[ChordSegment] = []
    for i, state in enumerate(states):
        if state == len(LABELS):  # no chord
            continue
        root, quality = LABELS[state]
        name = chord_name(root, quality, flats)
        start, end = float(times[i]), float(times[i + 1])
        if segments and segments[-1].chord == name and abs(segments[-1].end - start) < 1e-6:
            segments[-1].end = end
        else:
            segments.append(ChordSegment(start, end, name))
    return _drop_blips(segments), key, duration


def _drop_blips(segments: list[ChordSegment], min_length: float = 0.6) -> list[ChordSegment]:
    """Remove very short chords by absorbing them into the previous chord."""
    out: list[ChordSegment] = []
    for seg in segments:
        if out and seg.end - seg.start < min_length:
            out[-1].end = seg.end
        elif out and out[-1].chord == seg.chord and abs(out[-1].end - seg.start) < 1e-6:
            out[-1].end = seg.end
        else:
            out.append(ChordSegment(seg.start, seg.end, seg.chord))
    return out
