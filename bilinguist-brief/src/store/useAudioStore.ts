import { create } from 'zustand';

// ─── Global audio playback state ─────────────────────────────────────────────
// Shared between BriefingArticle (triggers playback) and FloatingAudioPill
// (reflects state). The actual Audio.Sound object lives in audioPlayer.ts so
// it doesn't need to be serialised or stored in React state.

interface AudioStore {
  isPlaying: boolean;
  isLoading: boolean;
  /** Headline currently being synthesised / played (used for per-article state) */
  headline: string | null;

  setLoading: (headline: string) => void;
  setPlaying: () => void;
  setIdle: () => void;
}

export const useAudioStore = create<AudioStore>()((set) => ({
  isPlaying: false,
  isLoading: false,
  headline: null,

  setLoading: (headline) => set({ isLoading: true, isPlaying: false, headline }),
  setPlaying: () => set({ isLoading: false, isPlaying: true }),
  setIdle: () => set({ isLoading: false, isPlaying: false }),
}));
