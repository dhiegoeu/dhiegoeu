import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { keyPrefersFlats, layoutLine, sheetToText, transposeChord, transposeKey } from '../chordSheet';
import { useTheme } from '../theme';
import type { AnalysisResult } from '../types';
import { Button } from './Button';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const PADDING = 20;
// Monospace glyphs are ~0.6em wide; 0.62 leaves a margin so rows never wrap and break alignment.
const CHAR_WIDTH_EM = 0.62;
// Some platforms (react-native-web) collapse runs of spaces; non-breaking spaces keep chords aligned.
const keepSpaces = (s: string) => s.replace(/ /g, '\u00A0');

type Props = { result: AnalysisResult; onBack: () => void; onSave?: () => void; saved: boolean };

export function SheetScreen({ result, onBack, onSave, saved }: Props) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(15);
  const [copied, setCopied] = useState(false);

  const key = transposeKey(result.key, semitones);
  const flats = keyPrefersFlats(key);
  const maxChars = Math.max(12, Math.floor((width - PADDING * 2) / (fontSize * CHAR_WIDTH_EM)));

  const blocks = useMemo(() => {
    const transpose = (c: string) => (semitones === 0 ? c : transposeChord(c, semitones, flats));
    return result.lines.map((line) => ({ line, rows: layoutLine(line, maxChars, transpose) }));
  }, [result, semitones, flats, maxChars]);

  const shift = (d: number) => setSemitones((s) => (((s + d + 6) % 12) + 12) % 12 - 6);
  const semitoneLabel = semitones === 0 ? 'Original' : semitones > 0 ? `+${semitones}` : `${semitones}`;

  const copy = async () => {
    await Clipboard.setStringAsync(sheetToText(result, semitones));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = () => Share.share({ title: result.title, message: sheetToText(result, semitones) });

  const mono = { fontFamily: MONO, fontSize, lineHeight: Math.round(fontSize * 1.35) };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { borderColor: t.border, backgroundColor: t.card }]}>
        <View style={styles.titleRow}>
          <Button label="‹ Voltar" variant="secondary" onPress={onBack} style={styles.small} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{result.title}</Text>
            {key ? <Text style={{ color: t.muted }}>Tom: {key}</Text> : null}
          </View>
        </View>
        <View style={styles.toolbar}>
          <Button label="−" accessibilityLabel="Descer um semitom" variant="secondary" onPress={() => shift(-1)} style={styles.tiny} />
          <Text style={[styles.semi, { color: t.text }]} accessibilityLabel={`Transposição ${semitoneLabel}`}>{semitoneLabel}</Text>
          <Button label="+" accessibilityLabel="Subir um semitom" variant="secondary" onPress={() => shift(1)} style={styles.tiny} />
          <View style={{ flex: 1 }} />
          <Button label="A−" accessibilityLabel="Diminuir letra" variant="secondary" onPress={() => setFontSize((s) => Math.max(11, s - 1))} style={styles.tiny} />
          <Button label="A+" accessibilityLabel="Aumentar letra" variant="secondary" onPress={() => setFontSize((s) => Math.min(24, s + 1))} style={styles.tiny} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: PADDING, paddingBottom: 120 }}>
        {!result.has_lyrics ? (
          <View style={[styles.banner, { backgroundColor: t.warnBg }]}>
            <Text style={{ color: t.warnText }}>
              {result.lyrics_error ?? 'Não encontrei letra nesta música (instrumental ou voz muito baixa). Mostrando só os acordes.'}
            </Text>
          </View>
        ) : null}

        {blocks.length === 0 ? (
          <Text style={{ color: t.muted }}>Não consegui reconhecer acordes neste áudio.</Text>
        ) : null}

        {blocks.map(({ line, rows }, i) => (
          <View key={i} style={styles.block}>
            {rows.map((row, j) => (
              <View key={j}>
                {row.chords ? (
                  <Text style={[mono, { color: t.chord, fontWeight: '800' }]} numberOfLines={1} ellipsizeMode="clip">
                    {keepSpaces(line.type === 'instrumental' ? `[ ${row.chords} ]` : row.chords)}
                  </Text>
                ) : null}
                {row.lyric ? (
                  <Text style={[mono, { color: t.text }]} numberOfLines={1} ellipsizeMode="clip">{row.lyric}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <Text style={{ color: t.muted, fontSize: 12, marginTop: 16 }}>
          Cifra gerada automaticamente por análise de áudio. Pode conter erros de acordes ou de letra: confira de ouvido.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { borderColor: t.border, backgroundColor: t.card }]}>
        <Button label={copied ? 'Copiado ✓' : 'Copiar'} variant="secondary" onPress={copy} style={{ flex: 1 }} />
        <Button label="Compartilhar" variant="secondary" onPress={share} style={{ flex: 1 }} />
        {onSave ? <Button label={saved ? 'Salva ✓' : 'Salvar'} onPress={onSave} disabled={saved} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semi: { minWidth: 64, textAlign: 'center', fontWeight: '700' },
  small: { minHeight: 40, paddingHorizontal: 12 },
  tiny: { minHeight: 40, minWidth: 44, paddingHorizontal: 12 },
  banner: { padding: 12, borderRadius: 10, marginBottom: 16 },
  block: { marginBottom: 14 },
  footer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, position: 'absolute', left: 0, right: 0, bottom: 0 },
});
