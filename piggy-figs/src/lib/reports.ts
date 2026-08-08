// Bilinguist Brief pipeline reports: fetch from bilinguist-worker, persist
// every run locally, never discard history. Uses expo-file-system's stable
// "legacy" promise-based API rather than the brand-new class-based one —
// after this session's Liquid Glass experience, betting on the newest Expo
// API surface isn't worth the risk for something this simple.
import * as FileSystem from 'expo-file-system/legacy';

// The app's own public production endpoint (bilinguist-brief/eas.json uses
// the same value via EXPO_PUBLIC_DATA_URL) — not a secret, just this app's
// API base URL.
const WORKER_BASE = 'https://bilinguist-brief.williamdiggz.workers.dev';

const REPORTS_DIR = `${FileSystem.documentDirectory}bilinguist-reports/`;

export interface LevelReport {
  level: string;
  length: string;
  articles: number;
  avgWords: number;
  target: [number, number];
  status: 'ok' | 'under' | 'over' | 'missing';
}

export interface LanguageReport {
  lang: string;
  name: string;
  nativeGrade: string;
  levels: LevelReport[];
  native: { articles: number; avgWords: number };
}

export interface StageCost {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costGbp: number;
}

export interface StoryScore {
  rank: number;
  score: number;
  max: number;
  slug: string;
  headline: string;
  outlets: string[];
}

export interface PipelineReport {
  date: string;
  generatedAt: number;
  volume: number;
  durationMs: number;
  status: 'ok' | 'gaps' | 'failed';
  published: boolean;
  coverage: { present: number; total: number; ratio: number };
  stories: { count: number; genres: string[] };
  languages: LanguageReport[];
  missing: string[];
  warnings: string[];
  factcheck: { stories: number; corrections: number };
  scores: StoryScore[];
  cost: { totalUsd: number; totalGbp: number; stages: Record<string, StageCost> };
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(REPORTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(REPORTS_DIR, { intermediates: true });
  }
}

function fileFor(date: string): string {
  return `${REPORTS_DIR}report_${date}.json`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${WORKER_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Worker request failed (${res.status}): ${path}`);
  }
  return res.json();
}

export async function fetchLatestReport(): Promise<PipelineReport> {
  return fetchJson<PipelineReport>('/report');
}

export async function fetchReportByDate(date: string): Promise<PipelineReport> {
  return fetchJson<PipelineReport>(`/report/${date}`);
}

export async function fetchReportIndex(): Promise<string[]> {
  const { dates } = await fetchJson<{ dates: string[] }>('/report/index');
  return dates;
}

export async function saveReportLocally(report: PipelineReport): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(fileFor(report.date), JSON.stringify(report));
}

// Newest first.
export async function listLocalDates(): Promise<string[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(REPORTS_DIR);
  return files
    .map((f) => f.match(/^report_(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter((d): d is string => !!d)
    .sort()
    .reverse();
}

export async function loadLocalReport(date: string): Promise<PipelineReport | null> {
  const info = await FileSystem.getInfoAsync(fileFor(date));
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(fileFor(date));
  return JSON.parse(raw);
}

export interface SyncResult {
  latest: PipelineReport;
  newDates: string[];
}

// Pulls the latest report (always, to catch same-day corrections) and
// backfills any dates the device doesn't have yet, per the spec's "never
// discard, never miss a day" requirement.
export async function syncReports(onProgress?: (msg: string) => void): Promise<SyncResult> {
  onProgress?.('Fetching latest report…');
  const latest = await fetchLatestReport();
  await saveReportLocally(latest);

  const [remoteDates, localDates] = await Promise.all([
    fetchReportIndex().catch(() => [latest.date]),
    listLocalDates(),
  ]);

  const localSet = new Set(localDates);
  const missingDates = remoteDates.filter((d) => !localSet.has(d));

  const newDates: string[] = [];
  for (const date of missingDates) {
    onProgress?.(`Backfilling ${date}…`);
    try {
      const report = await fetchReportByDate(date);
      await saveReportLocally(report);
      newDates.push(date);
    } catch {
      // One missing/corrupt historical file shouldn't block the rest.
    }
  }

  return { latest, newDates };
}
