import type { DocumentPickerAsset } from 'expo-document-picker';
import { Platform } from 'react-native';
import type { AnalysisResult, JobStatus } from './types';

export type ServerConfig = { baseUrl: string; apiKey: string };

const POLL_MS = 2000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const MAX_POLL_FAILURES = 5;

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = 'http://' + url;
  return url;
}

function headers(cfg: ServerConfig): Record<string, string> {
  return cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {};
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // not JSON
  }
  return `Erro do servidor (${res.status}).`;
}

export async function startAnalysis(
  cfg: ServerConfig,
  asset: DocumentPickerAsset,
  language: string | null,
  signal: AbortSignal,
): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web' && asset.file) {
    form.append('file', asset.file, asset.name);
  } else {
    // React Native's FormData streams the file from disk given {uri, name, type}.
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'video/mp4' } as unknown as Blob);
  }
  if (language) form.append('language', language);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/analyze`, { method: 'POST', body: form, headers: headers(cfg), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(`Não consegui falar com o servidor em ${cfg.baseUrl}. Confira o endereço nas configurações e se o servidor está ligado.`);
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).job_id as string;
}

export async function waitForResult(
  cfg: ServerConfig,
  jobId: string,
  onProgress: (stage: string, fraction: number) => void,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const started = Date.now();
  let failures = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' }); // DOMException is not guaranteed in Hermes
    try {
      const res = await fetch(`${cfg.baseUrl}/api/jobs/${jobId}`, { headers: headers(cfg), signal });
      if (!res.ok) throw new Error(await errorMessage(res));
      failures = 0;
      const job = (await res.json()) as JobStatus;
      if (job.status === 'done' && job.result) return job.result;
      if (job.status === 'error') throw new Error(job.error ?? 'A análise falhou.');
      onProgress(job.stage, job.progress);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') throw err;
      // Transient network errors (phone switching networks, screen lock) get a few retries;
      // errors reported by the server itself are final.
      if (err instanceof TypeError && ++failures < MAX_POLL_FAILURES) {
        // fall through to the sleep below
      } else {
        throw err instanceof TypeError ? new Error('Perdi a conexão com o servidor.') : err;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error('A análise demorou demais. Tente uma música mais curta.');
}
