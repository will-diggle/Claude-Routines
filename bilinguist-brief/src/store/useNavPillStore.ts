import { create } from 'zustand';
import type { LanguageCode } from './useSettingsStore';

export type SettingsSection = 'languages' | 'genres' | 'display' | 'profile';

interface NavPillStore {
  // Brief horizontal pager — which language page is showing
  briefPageIndex: number;
  setBriefPageIndex: (index: number) => void;

  // Preferences section switcher
  settingsSection: SettingsSection;
  setSettingsSection: (section: SettingsSection) => void;

  // Practice language filter
  practiceLang: LanguageCode | 'all';
  setPracticeLang: (lang: LanguageCode | 'all') => void;

  // Hides the floating tab bar while inside a game screen
  gameActive: boolean;
  setGameActive: (active: boolean) => void;

  // True when the user has scrolled down the briefing feed — docks the audio pill
  briefingScrolled: boolean;
  setBriefingScrolled: (scrolled: boolean) => void;

  // Set to true when user taps a nav pill while audio is docked — forces audio back up
  audioPillForcedUp: boolean;
  setAudioPillForcedUp: (v: boolean) => void;
}

export const useNavPillStore = create<NavPillStore>((set) => ({
  briefPageIndex: 0,
  setBriefPageIndex: (index) => set({ briefPageIndex: index }),

  settingsSection: 'languages',
  setSettingsSection: (section) => set({ settingsSection: section }),

  practiceLang: 'all',
  setPracticeLang: (lang) => set({ practiceLang: lang }),

  gameActive: false,
  setGameActive: (active) => set({ gameActive: active }),

  briefingScrolled: false,
  setBriefingScrolled: (scrolled) => set(
    scrolled ? { briefingScrolled: true } : { briefingScrolled: false, audioPillForcedUp: false }
  ),

  audioPillForcedUp: false,
  setAudioPillForcedUp: (v) => set({ audioPillForcedUp: v }),
}));
