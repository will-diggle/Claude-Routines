import { create } from 'zustand';
import type { LanguageCode } from './useSettingsStore';

// ─── Global audio playback state ─────────────────────────────────────────────
// Shared between BriefingArticle (triggers playback) and FloatingAudioPill
// (reflects state). The actual Audio.Sound object lives in audioPlayer.ts so
// it doesn't need to be serialised or stored in React state.

export interface QueuedTrack {
  language: LanguageCode;
  headline: string;
  audioKey: string;
  /** The brief's bundle date (e.g. '2026-09-08') — audio is generated the
   *  same day as the brief, so this doubles as the audio's creation date. */
  date: string;
}

interface AudioStore {
  isPlaying: boolean;
  isLoading: boolean;
  /** Headline currently being synthesised / played (used for per-article state) */
  headline: string | null;
  /** Bundle date of the currently playing/loading track, shown under the
   *  headline in the pill. Null for on-device speech (no associated brief). */
  date: string | null;
  /** Language of the currently playing/loading track — used to localize the
   *  date label under the headline. */
  language: LanguageCode | null;
  /** Tracks queued to auto-play, in order, once the current one finishes. */
  queue: QueuedTrack[];

  setLoading: (headline: string, date?: string | null, language?: LanguageCode | null) => void;
  setPlaying: () => void;
  /** Explicit pause — track stays loaded and resumable, so `headline` is
   *  kept (that's what lets a second tap on the same article resume it). */
  setIdle: () => void;
  /** Track ended naturally, or was stopped outright — the underlying sound
   *  is gone, so `headline` is cleared too. Without this, a second tap on
   *  the same article after it finished gets misread as "resume a paused
   *  track" and silently no-ops instead of starting it again. */
  setFinished: () => void;
  enqueue: (track: QueuedTrack) => void;
  /** Removes and returns the next queued track, or undefined if empty. */
  dequeueNext: () => QueuedTrack | undefined;
  replaceQueue: (tracks: QueuedTrack[]) => void;
  clearQueue: () => void;
}

export const useAudioStore = create<AudioStore>()((set, get) => ({
  isPlaying: false,
  isLoading: false,
  headline: null,
  date: null,
  language: null,
  queue: [],

  setLoading: (headline, date = null, language = null) => set({ isLoading: true, isPlaying: false, headline, date, language }),
  setPlaying: () => set({ isLoading: false, isPlaying: true }),
  setIdle: () => set({ isLoading: false, isPlaying: false }),
  setFinished: () => set({ isLoading: false, isPlaying: false, headline: null, date: null, language: null }),
  enqueue: (track) => set((s) => ({ queue: [...s.queue, track] })),
  dequeueNext: () => {
    const { queue } = get();
    if (queue.length === 0) return undefined;
    const [next, ...rest] = queue;
    set({ queue: rest });
    return next;
  },
  replaceQueue: (tracks) => set({ queue: tracks }),
  clearQueue: () => set({ queue: [] }),
}));
