"""Synthetic chord-progression audio for tests."""
import numpy as np

SR = 22050
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def chord_pitches(name: str) -> list[int]:
    root = name[:2] if len(name) > 1 and name[1] in "#b" else name[0]
    rest = name[len(root):]
    r = NOTE[root]
    intervals = {"": (0, 4, 7), "m": (0, 3, 7), "7": (0, 4, 7, 10), "m7": (0, 3, 7, 10)}[rest]
    return [r + i for i in intervals]


def tone(midi: float, dur: float) -> np.ndarray:
    t = np.arange(int(SR * dur)) / SR
    f = 440.0 * 2 ** ((midi - 69) / 12)
    sig = sum((1.0 / h) * np.sin(2 * np.pi * f * h * t) for h in range(1, 6))
    env = np.minimum(1, t / 0.02) * np.exp(-0.4 * t)
    return sig * env


def progression(chords: list[str], beat: float = 2.0, repeats: int = 4, with_click: bool = True) -> np.ndarray:
    parts = []
    for _ in range(repeats):
        for c in chords:
            n = int(SR * beat)
            buf = np.zeros(n)
            for p in chord_pitches(c):
                buf += tone(48 + p, beat)[:n]            # chord tones, octave 3
            buf += 1.2 * tone(36 + chord_pitches(c)[0], beat)[:n]  # bass note
            if with_click:  # a soft percussive pulse so beat tracking has something to lock to
                for k in range(int(beat / 0.5)):
                    i = int(k * 0.5 * SR)
                    buf[i:i + 400] += np.random.default_rng(k).standard_normal(400) * 0.4 * np.exp(-np.arange(400) / 80)
            parts.append(buf)
    y = np.concatenate(parts)
    return (y / np.max(np.abs(y)) * 0.8).astype(np.float32)
