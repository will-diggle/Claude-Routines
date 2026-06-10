export const Colors = {
  // Backgrounds
  white: '#FFFFFF',
  whiteSurface: '#F8F8F8',
  whiteCard: '#FAFAFA',
  cream: '#F5F2ED',
  softGrey: '#EDEBE6',
  night: '#141414',
  nightSurface: '#1E1E1E',
  nightCard: '#252525',
  creamSurface: '#EDEAE5',
  creamCard: '#F8F5F0',

  // Ink
  inkDark: '#1A1A1A',
  inkMid: '#3D3D3D',
  inkLight: '#6B6B6B',
  inkFaint: '#9A9A9A',

  // Night ink
  nightInkDark: '#F0EDE6',
  nightInkMid: '#C8C4BC',
  nightInkLight: '#8A8680',

  // Borders
  borderLight: '#E0DDD5',
  borderMid: '#C8C4BC',
  borderNight: '#2E2E2E',

  // Navy
  navyBg: '#162032',
  navySurface: '#1E2D42',
  navyCard: '#243552',
  navyBorder: '#203050',
  navyBorderMid: '#2A3D5A',

  // Accent
  accentGold: '#7D6B4F',
  accentRed: '#8B1A1A',
} as const;

export type BackgroundKey = 'white' | 'cream' | 'softGrey' | 'night';

export const BackgroundColors: Record<BackgroundKey, string> = {
  white: Colors.white,
  cream: Colors.cream,
  softGrey: '#162032',
  night: Colors.night,
};

export type FontFamilyKey = 'playfair' | 'garamond' | 'times' | 'georgia';

export const FontFamilies: Record<FontFamilyKey, { regular: string; bold: string; italic: string; label: string }> = {
  garamond: {
    regular: 'EBGaramond_400Regular',
    bold: 'EBGaramond_700Bold',
    italic: 'EBGaramond_400Regular_Italic',
    label: 'EB Garamond',
  },
  playfair: {
    regular: 'PlayfairDisplay_400Regular',
    bold: 'PlayfairDisplay_700Bold',
    italic: 'PlayfairDisplay_400Regular_Italic',
    label: 'Playfair Display',
  },
  // Times New Roman is a native iOS system font; falls back to default serif on Android.
  times: {
    regular: 'TimesNewRomanPSMT',
    bold: 'TimesNewRomanPS-BoldMT',
    italic: 'TimesNewRomanPS-ItalicMT',
    label: 'Times New Roman',
  },
  georgia: {
    regular: 'Georgia',
    bold: 'Georgia-Bold',
    italic: 'Georgia-Italic',
    label: 'Georgia',
  },
};

export type FontSizeKey = 'small' | 'medium' | 'large' | 'extraLarge';

export const FontSizes: Record<FontSizeKey, { body: number; heading: number; subheading: number; caption: number; label: string }> = {
  small: { body: 14, heading: 22, subheading: 17, caption: 11, label: 'Small' },
  medium: { body: 16, heading: 26, subheading: 19, caption: 12, label: 'Medium' },
  large: { body: 18, heading: 30, subheading: 22, caption: 13, label: 'Large' },
  extraLarge: { body: 21, heading: 34, subheading: 25, caption: 15, label: 'Extra Large' },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
