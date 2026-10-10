import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AnalysisResult, SavedSong } from './types';

const SETTINGS_KEY = 'cifra:settings:v1';
const SONGS_KEY = 'cifra:songs:v1';
const MAX_SONGS = 30;

export type Settings = { serverUrl: string; apiKey: string; language: string | null };

// 10.0.2.2 is the host machine as seen from the Android emulator.
export const DEFAULT_SETTINGS: Settings = {
  serverUrl: Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000',
  apiKey: '',
  language: null,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience; the app keeps working without it.
  }
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(SETTINGS_KEY, {})) };
}

export const saveSettings = (s: Settings) => writeJson(SETTINGS_KEY, s);

export const loadSongs = () => readJson<SavedSong[]>(SONGS_KEY, []);

export async function saveSong(result: AnalysisResult): Promise<SavedSong[]> {
  const song: SavedSong = { id: Date.now().toString(36), savedAt: Date.now(), result };
  const songs = [song, ...(await loadSongs())].slice(0, MAX_SONGS);
  await writeJson(SONGS_KEY, songs);
  return songs;
}

export async function deleteSong(id: string): Promise<SavedSong[]> {
  const songs = (await loadSongs()).filter((s) => s.id !== id);
  await writeJson(SONGS_KEY, songs);
  return songs;
}
