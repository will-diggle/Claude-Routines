import type { Ionicons } from '@expo/vector-icons';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';

export type GameKey = 'Flashcards' | 'Matching' | 'MultipleChoice' | 'FillBlank' | 'Translation';

// Single source of truth for each game's identity — icon, colour, label,
// description. Was previously defined only inside PracticeScreen for the game
// picker; the end-of-game screen re-picked its own icon per file (a shared
// trophy for two games, a different icon each for the rest, none of them tied
// to this), so finishing a game showed different iconography from choosing it.
// Exported so both screens read the same row instead of drifting again.
export const GAME_META: Record<GameKey, {
  key: GameKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
  tint: string;
}> = {
  Flashcards:     { key: 'Flashcards',     label: 'Flashcards',            icon: 'layers-outline',          description: 'Flip cards with spaced repetition',              tint: '#4A6FA5' },
  Matching:       { key: 'Matching',       label: 'Speed Snap',            icon: 'grid-outline',            description: 'Match words to translations against the clock', tint: '#B5510A' },
  MultipleChoice: { key: 'MultipleChoice', label: 'Multiple Choice',       icon: 'list-outline',            description: 'Which word means…? Four options',                tint: '#1E6B3A' },
  FillBlank:      { key: 'FillBlank',      label: 'Fill in the Blank',     icon: 'pencil-outline',          description: 'Complete the original news sentence',            tint: '#6A1B9A' },
  Translation:    { key: 'Translation',    label: 'Translation Challenge', icon: 'swap-horizontal-outline', description: 'Translate between languages',                    tint: '#8B1A1A' },
};

export const GAMES: Array<typeof GAME_META[GameKey]> = [
  GAME_META.Flashcards,
  GAME_META.Matching,
  GAME_META.MultipleChoice,
  GAME_META.FillBlank,
  GAME_META.Translation,
];
