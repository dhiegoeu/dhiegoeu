from app.chords import ChordSegment
from app.chordsheet import build_sheet, render_text
from app.lyrics import LyricLine, Word, group_words_into_lines


def line(*words):
    ws = [Word(s, e, t) for s, e, t in words]
    return LyricLine(ws[0].start, ws[-1].end, ws)


def test_chord_lands_on_the_word_it_starts_on():
    ly = line((10.0, 10.5, "Eu"), (10.5, 11.0, "te"), (11.0, 11.6, "amo"), (11.6, 12.0, "hoje"))
    chords = [ChordSegment(8, 11.0, "C"), ChordSegment(11.0, 14, "G")]
    sheet = [l for l in build_sheet([ly], chords, 14) if l.type == "lyric"]
    assert sheet[0].text == "Eu te amo hoje"
    placed = [(c.chord, c.pos) for c in sheet[0].chords]
    assert placed == [("C", 0), ("G", 6)]  # "amo" starts at char 6


def test_chord_in_the_middle_of_a_word_is_placed_proportionally():
    ly = line((0.0, 2.0, "aleluia"))
    chords = [ChordSegment(0, 1.0, "Am"), ChordSegment(1.0, 2.0, "F")]
    f = build_sheet([ly], chords, 2)[0].chords[1]
    assert f.chord == "F" and 2 <= f.pos <= 4


def test_chord_near_end_of_word_snaps_to_next_word():
    ly = line((0.0, 1.0, "nesta"), (1.1, 2.0, "data"))
    chords = [ChordSegment(0, 0.95, "Am"), ChordSegment(0.95, 3, "F")]
    f = build_sheet([ly], chords, 3)[0].chords[1]
    assert f.chord == "F" and f.pos == 6  # start of "data", not inside "nesta"


def test_opening_chord_from_before_the_line_is_shown_at_start():
    ly = line((5.0, 6.0, "oi"), (6.0, 7.0, "mundo"))
    sheet = build_sheet([ly], [ChordSegment(0, 20, "D")], 20)
    assert [(c.chord, c.pos) for c in sheet[0].chords] == [("D", 0)]


def test_instrumental_gaps_become_chord_only_lines():
    ly = line((10.0, 11.0, "fim"))
    chords = [ChordSegment(0, 3, "C"), ChordSegment(3, 6, "G"), ChordSegment(6, 20, "C")]
    sheet = build_sheet([ly], chords, 20)
    assert sheet[0].type == "instrumental"
    assert [c.chord for c in sheet[0].chords] == ["C", "G", "C"]
    assert sheet[1].type == "lyric"


def test_no_lyrics_still_gives_chords():
    sheet = build_sheet([], [ChordSegment(0, 4, "Em"), ChordSegment(4, 8, "C")], 8)
    assert len(sheet) == 1 and sheet[0].type == "instrumental"


def test_render_text_aligns_chords_above_words():
    ly = line((0, 1, "Eu"), (1, 2, "te"), (2, 3, "amo"))
    sheet = build_sheet([ly], [ChordSegment(0, 2, "C"), ChordSegment(2, 4, "G")], 4)
    out = render_text(sheet).splitlines()
    assert out[0] == "C     G"
    assert out[1] == "Eu te amo"


def test_group_words_splits_on_pauses_and_length():
    words = [Word(0, 0.5, "a"), Word(0.6, 1, "b"), Word(3, 3.4, "c")]
    assert [l.text for l in group_words_into_lines(words)] == ["a b", "c"]
    many = [Word(i * 0.3, i * 0.3 + 0.2, "palavra") for i in range(20)]
    assert all(len(l.text) <= 60 for l in group_words_into_lines(many))
