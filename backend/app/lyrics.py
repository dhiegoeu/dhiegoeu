"""Lyrics transcription with faster-whisper (word-level timestamps)."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass

_model = None
_model_lock = threading.Lock()


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class LyricLine:
    start: float
    end: float
    words: list[Word]

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


def _get_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            size = os.environ.get("WHISPER_MODEL", "small")
            device = os.environ.get("WHISPER_DEVICE", "auto")
            compute = os.environ.get("WHISPER_COMPUTE_TYPE", "int8" if device in ("cpu", "auto") else "float16")
            _model = WhisperModel(size, device=device, compute_type=compute)
        return _model


def transcribe(path: str, language: str | None = None) -> tuple[list[LyricLine], str | None]:
    """Transcribe sung/spoken words. Returns (lines, detected language)."""
    model = _get_model()
    language = language or os.environ.get("WHISPER_LANGUAGE") or None
    segments, info = model.transcribe(
        path,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,  # avoids repetition loops common with music
        beam_size=5,
    )
    words: list[Word] = []
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append(Word(float(w.start), float(w.end), text))
    return group_words_into_lines(words), info.language


def group_words_into_lines(
    words: list[Word], max_gap: float = 0.9, max_chars: int = 48, max_words: int = 9
) -> list[LyricLine]:
    """Split a stream of timed words into singable lines.

    A new line starts after a pause (sung phrases are separated by breaths), after
    sentence punctuation, or when the line gets too long to fit a phone screen.
    """
    lines: list[LyricLine] = []
    current: list[Word] = []

    def flush() -> None:
        if current:
            lines.append(LyricLine(current[0].start, current[-1].end, list(current)))
            current.clear()

    for word in words:
        if current:
            gap = word.start - current[-1].end
            length = sum(len(w.text) + 1 for w in current) + len(word.text)
            ends_sentence = current[-1].text.rstrip().endswith((".", "!", "?"))
            if gap > max_gap or length > max_chars or len(current) >= max_words or ends_sentence:
                flush()
        current.append(word)
    flush()
    return lines
