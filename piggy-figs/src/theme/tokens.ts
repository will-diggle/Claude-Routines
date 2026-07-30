// Piggy Figs' visual language, adapted from the Bilinguist Brief design
// system (newspaper/editorial serif look, glass buttons, the "chrome"
// accent-pairing concept) — same tokens, different masthead. Two of that
// system's four themes are implemented here (White, Night — the light/dark
// poles); Cream and Navy are a documented follow-up, not guessed at.
import { useColorScheme } from 'react-native';

export type ThemeName = 'white' | 'night';

export interface ThemeColors {
  bg: string;
  surface: string;
  card: string;
  ink: string;
  inkMid: string;
  inkLight: string;
  inkFaint: string;
  border: string;
  borderMid: string;
  accentRed: string;
  accentGold: string;
  /** The paired accent ink for this theme — cream on dark, inkDark on
   * light. Used for selected/active states instead of a generic blue. */
  chrome: string;
}

const WHITE: ThemeColors = {
  bg: '#FDFCFB',
  surface: '#F5F3F1',
  card: '#FAF9F8',
  ink: '#1A1A1A',
  inkMid: '#3D3D3D',
  inkLight: '#6B6B6B',
  inkFaint: '#9A9A9A',
  border: '#E0DDD5',
  borderMid: '#C8C4BC',
  accentRed: '#8B1A1A',
  accentGold: '#7D6B4F',
  chrome: '#1A1A1A',
};

const NIGHT: ThemeColors = {
  bg: '#141414',
  surface: '#080808',
  card: '#000000',
  ink: '#F0EDE6',
  inkMid: '#C8C4BC',
  inkLight: '#8A8680',
  inkFaint: '#555250',
  border: 'rgba(255,255,255,0.12)',
  borderMid: 'rgba(255,255,255,0.18)',
  accentRed: '#CF5F6A',
  accentGold: '#B09070',
  chrome: '#F0EDE6',
};

export const THEMES: Record<ThemeName, ThemeColors> = { white: WHITE, night: NIGHT };

export function useTheme(): { name: ThemeName; colors: ThemeColors } {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'light' ? 'white' : 'night';
  return { name, colors: THEMES[name] };
}

// Serif for headings/titles/mastheads (Lora/EB Garamond/Playfair/Times in
// the source system — no custom font files loaded here yet, so this falls
// back to the platform serif exactly as the design reference itself does
// when it can't load a webfont).
export const FONT_SERIF = 'Georgia';
// Narrow sans for UI chrome — labels, eyebrows, buttons. Never a serif here.
export const FONT_SANS = 'System';

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const RADIUS = {
  pill: 100, // pills / buttons / glass circles
  sheet: 28, // bottom sheets / modal top corners
  navButton: 17, // nav arrow buttons (34x34 circles)
  card: 12, // content cards / preview blocks
  input: 8, // segmented controls / input fields
  tag: 4, // progress pills / small tags
} as const;

export const LABEL_STYLE = {
  fontFamily: FONT_SANS,
  fontSize: 10,
  fontWeight: '700' as const,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
};
