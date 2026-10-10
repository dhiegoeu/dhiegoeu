"""Merge timed chords and timed lyrics into a chord sheet (chords above the words)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .chords import ChordSegment
from .lyrics import LyricLine


SNAP_FRACTION = 0.25


@dataclass
class PlacedChord:
    chord: str
    pos: int  # character offset in the lyric text
    time: float


@dataclass
class SheetLine:
    type: str  # "lyric" | "instrumental"
    start: float
    end: float
    text: str = ""
    chords: list[PlacedChord] = field(default_factory=list)


def _chord_at(chords: list[ChordSegment], t: float) -> ChordSegment | None:
    for seg in chords:
        if seg.start <= t < seg.end:
            return seg
    return None


def _word_offsets(line: LyricLine) -> list[int]:
    offsets, pos = [], 0
    for w in line.words:
        offsets.append(pos)
        pos += len(w.text) + 1
    return offsets


def _place_in_line(line: LyricLine, chords: list[ChordSegment]) -> list[PlacedChord]:
    """Position every chord that sounds during the line on the word it falls on."""
    offsets = _word_offsets(line)
    placed: list[PlacedChord] = []

    def char_pos(t: float) -> int:
        for i, w in enumerate(line.words):
            if t < w.start:
                return offsets[i]  # chord lands in the pause before this word
            if t < w.end:
                # Chords change on syllables. Word timestamps are approximate, so a chord
                # near a word edge snaps to that edge; only a clearly mid-word change
                # is placed proportionally.
                frac = (t - w.start) / max(w.end - w.start, 1e-6)
                if frac < SNAP_FRACTION:
                    return offsets[i]
                if frac > 1 - SNAP_FRACTION:
                    return offsets[i + 1] if i + 1 < len(offsets) else offsets[i] + len(w.text)
                return offsets[i] + int(len(w.text) * frac)
        return offsets[-1] + len(line.words[-1].text)

    opening = _chord_at(chords, line.start)
    if opening:
        placed.append(PlacedChord(opening.chord, 0, line.start))
    for seg in chords:
        if line.start < seg.start < line.end:
            pos = char_pos(seg.start)
            if placed and placed[-1].chord == seg.chord:
                continue
            placed.append(PlacedChord(seg.chord, pos, seg.start))
    return placed


def build_sheet(
    lyric_lines: list[LyricLine],
    chords: list[ChordSegment],
    duration: float,
    instrumental_min: float = 3.0,
) -> list[SheetLine]:
    """Build the sheet. Stretches without singing become chord-only 'instrumental' lines."""
    sheet: list[SheetLine] = []

    def add_instrumental(start: float, end: float) -> None:
        if end - start < instrumental_min:
            return
        seq: list[PlacedChord] = []
        for seg in chords:
            if seg.end <= start or seg.start >= end:
                continue
            if not seq or seq[-1].chord != seg.chord:
                seq.append(PlacedChord(seg.chord, 0, max(seg.start, start)))
        if seq:
            sheet.append(SheetLine("instrumental", start, end, "", seq))

    cursor = 0.0
    for line in lyric_lines:
        add_instrumental(cursor, line.start)
        sheet.append(SheetLine("lyric", line.start, line.end, line.text, _place_in_line(line, chords)))
        cursor = line.end
    add_instrumental(cursor, duration)
    return sheet


def render_text(sheet: list[SheetLine], title: str = "", key: str = "", width: int = 40) -> str:
    """Plain-text chord sheet (chord row above lyric row), for copy/share."""
    out: list[str] = []
    if title:
        out.append(title)
    if key:
        out.append(f"Tom: {key}")
    if out:
        out.append("")
    for line in sheet:
        if line.type == "instrumental":
            out.append("[ " + "  ".join(c.chord for c in line.chords) + " ]")
            out.append("")
            continue
        row = ""
        for c in line.chords:
            row = row.ljust(c.pos) if len(row) <= c.pos else row + " "
            row += c.chord
        if row:
            out.append(row)
        out.append(line.text)
        out.append("")
    return "\n".join(out).rstrip() + "\n"
