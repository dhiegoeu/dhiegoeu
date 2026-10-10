"""End-to-end analysis: media file -> chord sheet."""

from __future__ import annotations

import os
import subprocess
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from . import chords as chords_mod
from . import lyrics as lyrics_mod
from .chordsheet import build_sheet, render_text

Progress = Callable[[str, float], None]


def extract_audio(src: str, dst: str) -> None:
    """Decode any audio/video container (mp4, m4a, mov, mp3, ...) to mono 22.05 kHz WAV."""
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "22050", "-f", "wav", dst]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 or not os.path.exists(dst):
        raise ValueError("Não foi possível ler o áudio deste arquivo. Ele tem uma trilha de áudio?")


def analyze(src: str, workdir: str, title: str, language: str | None, progress: Progress) -> dict:
    wav = str(Path(workdir) / "audio.wav")

    progress("Extraindo o áudio do arquivo", 0.05)
    extract_audio(src, wav)

    progress("Reconhecendo os acordes", 0.15)
    segments, key, duration = chords_mod.recognize_chords(wav, lambda msg: progress(msg, 0.3))

    progress("Transcrevendo a letra (pode demorar)", 0.5)
    try:
        lines, detected_language = lyrics_mod.transcribe(wav, language)
        lyrics_error = None
    except Exception as exc:  # noqa: BLE001 - still deliver chords if lyrics fail
        lines, detected_language = [], None
        lyrics_error = f"Falha ao transcrever a letra: {exc}"

    progress("Montando a cifra", 0.9)
    sheet = build_sheet(lines, segments, duration)
    key_name = key.name if segments else ""

    return {
        "title": title,
        "duration": round(duration, 2),
        "key": key_name,
        "language": detected_language,
        "has_lyrics": bool(lines),
        "lyrics_error": lyrics_error,
        "lines": [
            {
                "type": line.type,
                "start": round(line.start, 2),
                "end": round(line.end, 2),
                "text": line.text,
                "chords": [{"chord": c.chord, "pos": c.pos, "time": round(c.time, 2)} for c in line.chords],
            }
            for line in sheet
        ],
        "chords": [asdict(s) for s in segments],
        "text": render_text(sheet, title, key_name),
    }
