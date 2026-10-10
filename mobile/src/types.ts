export type PlacedChord = { chord: string; pos: number; time: number };

export type SheetLine = {
  type: 'lyric' | 'instrumental';
  start: number;
  end: number;
  text: string;
  chords: PlacedChord[];
};

export type AnalysisResult = {
  title: string;
  duration: number;
  key: string;
  language: string | null;
  has_lyrics: boolean;
  lyrics_error: string | null;
  lines: SheetLine[];
  text: string;
};

export type JobStatus = {
  status: 'queued' | 'processing' | 'done' | 'error';
  stage: string;
  progress: number;
  result: AnalysisResult | null;
  error: string | null;
};

export type SavedSong = { id: string; savedAt: number; result: AnalysisResult };
