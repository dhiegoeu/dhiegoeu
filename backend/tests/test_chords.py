import soundfile as sf

from app.chords import recognize_chords
from tests.synth import SR, progression


def _chords(tmp_path, names):
    wav = tmp_path / "a.wav"
    sf.write(wav, progression(names), SR)
    segments, key, duration = recognize_chords(str(wav))
    return segments, key, duration


def test_major_progression_and_key(tmp_path):
    segments, key, duration = _chords(tmp_path, ["C", "Am", "F", "G"])
    assert key.name == "C"
    assert [s.chord for s in segments[:4]] == ["C", "Am", "F", "G"]
    assert abs(segments[1].start - 2.0) < 0.3
    assert duration == 32.0


def test_flat_key_uses_flat_names(tmp_path):
    segments, key, _ = _chords(tmp_path, ["Bb", "Gm", "Eb", "F"])
    assert key.name == "Bb"
    assert [s.chord for s in segments[:4]] == ["Bb", "Gm", "Eb", "F"]


def test_silence_yields_no_chords(tmp_path):
    import numpy as np

    wav = tmp_path / "s.wav"
    sf.write(wav, np.zeros(SR * 5, dtype="float32"), SR)
    segments, _, _ = recognize_chords(str(wav))
    assert segments == []
