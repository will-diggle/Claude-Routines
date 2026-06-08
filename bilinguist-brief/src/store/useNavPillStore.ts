import { create } from 'zustand';
import type { LanguageCode } from './useSettingsStore';

export type SettingsSection = 'reading' | 'display' | 'account';

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
}

export const useNavPillStore = create<NavPillStore>((set) => ({
  briefPageIndex: 0,
  setBriefPageIndex: (index) => set({ briefPageIndex: index }),

  settingsSection: 'reading',
  setSettingsSection: (section) => set({ settingsSection: section }),

  practiceLang: 'all',
  setPracticeLang: (lang) => set({ practiceLang: lang }),
}));
