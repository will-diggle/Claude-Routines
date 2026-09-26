import { WORKER_BASE } from './config';
import { APP_LANGUAGES, FALLBACK_AVAILABLE, type AppLang } from './app-locale';

// Which languages and levels today's brief contains, per length, e.g.
// { en: { short: ['Native'] }, fr: { short: ['A1', …, 'Native'], longer: ['B1'] } }.
// It changes with the pipeline, so it's read from the content Worker's
// /latest/available rather than kept here.
export type Availability = Partial<Record<AppLang, Record<string, string[]>>>;

export interface AvailabilityInfo {
  languages: Availability;
  nativeGrades: Record<string, unknown>;
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

let pending: Promise<AvailabilityInfo> | null = null;

export function loadAvailability(): Promise<AvailabilityInfo> {
  pending ??= (async () => {
    try {
      const res = await fetch(`${WORKER_BASE}/latest/available?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.languages && Object.keys(data.languages).length) {
          return { languages: data.languages, nativeGrades: data.nativeGrades ?? {} };
        }
      }
    } catch {
      // fall back below
    }
    return { languages: FALLBACK_AVAILABLE, nativeGrades: {} };
  })();
  return pending;
}

// Languages with any content today (or at `length`), in the app's order.
export function languagesToday(av: Availability, length?: string): AppLang[] {
  return APP_LANGUAGES.map((l) => l.code).filter((code) => {
    const byLength = av[code] ?? {};
    return length ? (byLength[length] ?? []).length > 0 : Object.values(byLength).some((lv) => lv.length > 0);
  });
}

// The app's rule: the levels written at this length, else every level the
// language has at any length.
export function levelsFor(av: Availability, code: AppLang, length: string): string[] {
  const byLength = av[code] ?? {};
  const perLength = byLength[length] ?? [];
  if (perLength.length) return perLength;
  const all = new Set<string>();
  for (const lv of Object.values(byLength)) lv.forEach((x) => all.add(x));
  return LEVEL_ORDER.filter((x) => all.has(x));
}

export function pickLevel(av: Availability, code: AppLang, length: string, preferred: string): string {
  const levels = levelsFor(av, code, length);
  if (levels.includes(preferred)) return preferred;
  const fallback = APP_LANGUAGES.find((l) => l.code === code)?.defaultLevel;
  if (fallback && levels.includes(fallback)) return fallback;
  return levels[0] ?? 'Native';
}

export function nativeGradeFor(info: AvailabilityInfo, code: AppLang, length: string): string | undefined {
  const g = info.nativeGrades[code];
  if (typeof g === 'string') return g;
  if (g && typeof g === 'object') {
    const perLength = (g as Record<string, unknown>)[length];
    if (typeof perLength === 'string') return perLength;
  }
  return undefined;
}
