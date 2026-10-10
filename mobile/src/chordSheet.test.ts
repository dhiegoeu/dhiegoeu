import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyPrefersFlats, layoutLine, sheetToText, transposeChord, transposeKey } from './chordSheet';
import type { SheetLine } from './types';

const lyric = (text: string, chords: [string, number][]): SheetLine => ({
  type: 'lyric',
  start: 0,
  end: 1,
  text,
  chords: chords.map(([chord, pos]) => ({ chord, pos, time: 0 })),
});

test('transposes roots, qualities and slash basses', () => {
  assert.equal(transposeChord('C', 2, false), 'D');
  assert.equal(transposeChord('Am7', 3, false), 'Cm7');
  assert.equal(transposeChord('C/E', 5, false), 'F/A');
  assert.equal(transposeChord('G', -12, false), 'G');
  assert.equal(transposeChord('A', 1, true), 'Bb');
  assert.equal(transposeChord('A', 1, false), 'A#');
  assert.equal(transposeChord('Bb', 2, false), 'C');
  assert.equal(transposeChord('???', 2, false), '???');
});

test('picks flat or sharp spelling for the key', () => {
  assert.equal(keyPrefersFlats('F'), true);
  assert.equal(keyPrefersFlats('Gm'), true);
  assert.equal(keyPrefersFlats('G'), false);
  assert.equal(transposeKey('G', 3), 'Bb');
  assert.equal(transposeKey('C', 2), 'D');
  assert.equal(transposeKey('Am', 2), 'Bm');
});

test('keeps chord above the syllable it belongs to', () => {
  const [row] = layoutLine(lyric('Eu te amo hoje', [['C', 0], ['G', 6]]), 40);
  assert.equal(row.chords, 'C     G');
  assert.equal(row.lyric, 'Eu te amo hoje');
  assert.equal(row.lyric.indexOf('amo'), row.chords.indexOf('G'));
});

test('wrapping keeps alignment on every row', () => {
  const text = 'um dois tres quatro cinco seis sete oito';
  const rows = layoutLine(lyric(text, [['C', 0], ['G', text.indexOf('quatro')], ['Am', text.indexOf('sete')]]), 20);
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.ok(r.lyric.length <= 20);
  const g = rows.find((r) => r.chords.includes('G'))!;
  assert.equal(g.lyric.indexOf('quatro'), g.chords.indexOf('G'));
  const am = rows.find((r) => r.chords.includes('Am'))!;
  assert.equal(am.lyric.indexOf('sete'), am.chords.indexOf('Am'));
});

test('adjacent chords never overlap', () => {
  const [row] = layoutLine(lyric('a b c', [['Am7', 0], ['Dm7', 1], ['G7', 2]]), 40);
  assert.deepEqual(row.chords.split(/\s+/), ['Am7', 'Dm7', 'G7']);
});

test('chord after the last word stays on the last row', () => {
  const rows = layoutLine(lyric('fim', [['C', 3]]), 40);
  assert.equal(rows[0].chords.trim(), 'C');
});

test('instrumental lines list chords and wrap', () => {
  const line: SheetLine = {
    type: 'instrumental', start: 0, end: 9, text: '',
    chords: ['C', 'G', 'Am', 'F'].map((chord) => ({ chord, pos: 0, time: 0 })),
  };
  assert.equal(layoutLine(line, 40)[0].chords, 'C   G   Am   F');
  assert.deepEqual(layoutLine(line, 12).map((r) => r.chords), ['C   G', 'Am   F']);
});

test('text export honors transposition', () => {
  const result = {
    title: 'Teste', duration: 5, key: 'C', language: 'pt', has_lyrics: true, lyrics_error: null, text: '',
    lines: [lyric('Eu te amo', [['C', 0], ['G', 3]])],
  };
  const txt = sheetToText(result, 2);
  assert.match(txt, /Tom: D/);
  assert.match(txt, /^D {2}A$/m);
  assert.match(txt, /^Eu te amo$/m);
});
