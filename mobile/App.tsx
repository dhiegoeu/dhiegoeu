import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { normalizeBaseUrl, startAnalysis, waitForResult } from './src/api';
import { HomeScreen } from './src/components/HomeScreen';
import { ProcessingScreen } from './src/components/ProcessingScreen';
import { SheetScreen } from './src/components/SheetScreen';
import { DEFAULT_SETTINGS, deleteSong, loadSettings, loadSongs, saveSettings, saveSong, type Settings } from './src/storage';
import { useTheme } from './src/theme';
import type { AnalysisResult, SavedSong } from './src/types';

type Screen =
  | { name: 'home' }
  | { name: 'processing'; fileName: string; stage: string; progress: number }
  | { name: 'sheet'; result: AnalysisResult; saved: boolean };

export default function App() {
  const t = useTheme();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadSongs().then(setSongs);
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const goHome = useCallback(() => {
    abortRef.current?.abort();
    setScreen({ name: 'home' });
  }, []);

  // Android hardware back: leave the current screen instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false;
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [screen.name, goHome]);

  const pickAndAnalyze = useCallback(async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['video/mp4', 'audio/*', 'video/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    const cfg = { baseUrl: normalizeBaseUrl(settings.serverUrl), apiKey: settings.apiKey.trim() };
    if (!cfg.baseUrl) {
      setError('Informe o endereço do servidor em "Servidor".');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const update = (stage: string, progress: number) =>
      setScreen((s) => (s.name === 'processing' ? { ...s, stage, progress } : s));

    setScreen({ name: 'processing', fileName: asset.name, stage: 'Enviando o arquivo…', progress: 0.02 });
    try {
      const jobId = await startAnalysis(cfg, asset, settings.language, controller.signal);
      const result = await waitForResult(cfg, jobId, update, controller.signal);
      setScreen({ name: 'sheet', result, saved: false });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user cancelled
      setError((e as Error).message);
      setScreen({ name: 'home' });
    }
  }, [settings]);

  const save = useCallback(async () => {
    if (screen.name !== 'sheet') return;
    setSongs(await saveSong(screen.result));
    setScreen({ ...screen, saved: true });
  }, [screen]);

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="auto" />
      {screen.name === 'home' && (
        <HomeScreen
          settings={settings}
          onSettings={updateSettings}
          songs={songs}
          onPick={pickAndAnalyze}
          onOpen={(song) => setScreen({ name: 'sheet', result: song.result, saved: true })}
          onDelete={async (song) => setSongs(await deleteSong(song.id))}
          error={error}
        />
      )}
      {screen.name === 'processing' && (
        <ProcessingScreen fileName={screen.fileName} stage={screen.stage} progress={screen.progress} onCancel={goHome} />
      )}
      {screen.name === 'sheet' && (
        <SheetScreen result={screen.result} onBack={goHome} onSave={save} saved={screen.saved} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
