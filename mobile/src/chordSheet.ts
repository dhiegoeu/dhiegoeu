import type { AnalysisResult, SheetLine } from './types';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]); // F Bb Eb Ab Db
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

function pitchClass(note: string): number {
  const i = SHARP.indexOf(note);
  return i >= 0 ? i : FLAT.indexOf(note);
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Transposes "Am7", "Bb", "C/E"... Returns the input unchanged if it is not a chord. */
export function transposeChord(chord: string, semitones: number, flats: boolean): string {
  const m = CHORD_RE.exec(chord);
  if (!m) return chord;
  const names = flats ? FLAT : SHARP;
  const root = names[mod12(pitchClass(m[1]) + semitones)];
  const bass = m[3] ? '/' + names[mod12(pitchClass(m[3]) + semitones)] : '';
  return root + m[2] + bass;
}

/** True if a key such as "Bb" or "Gm" is conventionally written with flats. */
export function keyPrefersFlats(key: string): boolean {
  const m = /^([A-G][#b]?)(m?)$/.exec(key);
  if (!m) return false;
  const pc = pitchClass(m[1]);
  return m[2] ? FLAT_MINOR.has(pc) : FLAT_MAJOR.has(pc);
}

export function transposeKey(key: string, semitones: number): string {
  if (!key) return key;
  const target = transposeChord(key, semitones, false);
  // Re-spell with flats when that is the conventional spelling of the new key.
  return keyPrefersFlats(transposeChord(key, semitones, true)) ? transposeChord(key, semitones, true) : target;
}

export type Row = { chords: string; lyric: string };

/** Greedy word wrap that returns [start, end) offsets of each chunk. */
function wrapOffsets(text: string, maxChars: number): [number, number][] {
  if (text.length <= maxChars) return [[0, text.length]];
  const chunks: [number, number][] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    chunks.push([start, end]);
    start = end;
    while (text[start] === ' ') start++; // do not start a row with the break space
  }
  return chunks;
}

/** Chord start columns: keep chords apart (>= 1 space) and inside [0, width]. */
function resolveColumns(wanted: number[], lengths: number[], width: number): number[] {
  const cols = wanted.map((c) => Math.max(0, c));
  const spread = () => {
    for (let i = 1; i < cols.length; i++) {
      cols[i] = Math.max(cols[i], cols[i - 1] + lengths[i - 1] + 1);
    }
  };
  spread();
  let limit = width;
  for (let i = cols.length - 1; i >= 0; i--) {
    cols[i] = Math.min(cols[i], limit - lengths[i]);
    limit = cols[i] - 1;
  }
  for (let i = 0; i < cols.length; i++) cols[i] = Math.max(0, cols[i]);
  spread();
  return cols;
}

/**
 * Lays one sheet line out as monospace rows, each a chord row above a lyric row, so that
 * every chord stays above the syllable it belongs to even after wrapping.
 */
export function layoutLine(
  line: SheetLine,
  maxChars: number,
  transpose: (chord: string) => string = (c) => c,
): Row[] {
  if (line.type === 'instrumental') {
    const limit = maxChars - 4; // the caller wraps each row in "[ ... ]"
    const rows: Row[] = [];
    let current = '';
    for (const c of line.chords) {
      const name = transpose(c.chord);
      const next = current ? current + '   ' + name : name;
      if (current && next.length > limit) {
        rows.push({ chords: current, lyric: '' });
        current = name;
      } else {
        current = next;
      }
    }
    if (current) rows.push({ chords: current, lyric: '' });
    return rows;
  }

  return wrapOffsets(line.text, maxChars).map(([a, b], idx, all) => {
    const last = idx === all.length - 1;
    const inChunk = line.chords.filter((c) => c.pos >= a && (c.pos < b || (last && c.pos >= b)));
    const names = inChunk.map((c) => transpose(c.chord));
    const cols = resolveColumns(
      inChunk.map((c) => Math.min(c.pos, b) - a),
      names.map((n) => n.length),
      Math.max(maxChars, b - a),
    );
    let row = '';
    names.forEach((name, i) => {
      row = row.padEnd(cols[i], ' ') + name;
    });
    return { chords: row, lyric: line.text.slice(a, b) };
  });
}

/** Plain-text chord sheet for copy/share, honoring the current transposition. */
export function sheetToText(result: AnalysisResult, semitones: number, width = 42): string {
  const flats = keyPrefersFlats(transposeKey(result.key, semitones));
  const transpose = (c: string) => (semitones === 0 && !flats ? c : transposeChord(c, semitones, flats));
  const out: string[] = [result.title];
  if (result.key) out.push(`Tom: ${transposeKey(result.key, semitones)}`);
  out.push('');
  for (const line of result.lines) {
    for (const row of layoutLine(line, width, transpose)) {
      if (row.chords) out.push(line.type === 'instrumental' ? `[ ${row.chords} ]` : row.chords);
      if (row.lyric) out.push(row.lyric);
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}
