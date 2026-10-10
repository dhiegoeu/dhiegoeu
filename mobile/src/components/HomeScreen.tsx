import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import type { Settings } from '../storage';
import type { SavedSong } from '../types';
import { Button } from './Button';

const LANGUAGES: { label: string; value: string | null }[] = [
  { label: 'Automático', value: null },
  { label: 'Português', value: 'pt' },
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

type Props = {
  settings: Settings;
  onSettings: (s: Settings) => void;
  songs: SavedSong[];
  onPick: () => void;
  onOpen: (song: SavedSong) => void;
  onDelete: (song: SavedSong) => void;
  error: string | null;
};

export function HomeScreen({ settings, onSettings, songs, onPick, onOpen, onDelete, error }: Props) {
  const t = useTheme();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: t.text }]}>Cifra</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>
        Envie uma música em mp4 (ou m4a, mp3, wav) e receba a cifra com a letra.
      </Text>

      {error ? (
        <View style={[styles.banner, { backgroundColor: t.warnBg }]} accessibilityRole="alert">
          <Text style={{ color: t.warnText }}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: t.muted }]}>Idioma da letra</Text>
      <View style={styles.chips}>
        {LANGUAGES.map((l) => {
          const active = settings.language === l.value;
          return (
            <Pressable
              key={l.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSettings({ ...settings, language: l.value })}
              style={[styles.chip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : t.card }]}
            >
              <Text style={{ color: active ? t.accentText : t.text, fontWeight: '600' }}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Button label="Escolher música" onPress={onPick} style={{ marginTop: 20 }} />

      <Pressable onPress={() => setShowSettings((v) => !v)} accessibilityRole="button" style={styles.settingsToggle}>
        <Text style={{ color: t.muted }}>{showSettings ? '▾' : '▸'} Servidor</Text>
      </Pressable>
      {showSettings ? (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.label, { color: t.muted }]}>Endereço do servidor</Text>
          <TextInput
            value={settings.serverUrl}
            onChangeText={(serverUrl) => onSettings({ ...settings, serverUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.0.10:8000"
            placeholderTextColor={t.muted}
            style={[styles.input, { color: t.text, borderColor: t.border }]}
          />
          <Text style={[styles.label, { color: t.muted }]}>Chave de acesso (opcional)</Text>
          <TextInput
            value={settings.apiKey}
            onChangeText={(apiKey) => onSettings({ ...settings, apiKey })}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholderTextColor={t.muted}
            style={[styles.input, { color: t.text, borderColor: t.border }]}
          />
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 8 }}>
            No celular, use o IP do computador na sua rede (não "localhost"). No emulador Android, 10.0.2.2.
          </Text>
        </View>
      ) : null}

      {songs.length > 0 ? (
        <>
          <Text style={[styles.section, { color: t.text }]}>Minhas cifras</Text>
          {songs.map((song) => (
            <Pressable
              key={song.id}
              accessibilityRole="button"
              onPress={() => onOpen(song)}
              onLongPress={() =>
                Alert.alert('Apagar cifra?', song.result.title, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Apagar', style: 'destructive', onPress: () => onDelete(song) },
                ])
              }
              style={[styles.card, styles.songRow, { backgroundColor: t.card, borderColor: t.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
                  {song.result.title}
                </Text>
                <Text style={{ color: t.muted, marginTop: 2 }}>
                  {song.result.key ? `Tom ${song.result.key} · ` : ''}
                  {new Date(song.savedAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={{ color: t.muted }}>›</Text>
            </Pressable>
          ))}
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Segure uma cifra para apagar.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, paddingBottom: 48 },
  title: { fontSize: 34, fontWeight: '800' },
  subtitle: { fontSize: 16, marginTop: 6, marginBottom: 20, lineHeight: 22 },
  banner: { padding: 12, borderRadius: 10, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  settingsToggle: { paddingVertical: 16, minHeight: 44, justifyContent: 'center' },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 44, fontSize: 16 },
  section: { fontSize: 20, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  songRow: { flexDirection: 'row', alignItems: 'center' },
});
