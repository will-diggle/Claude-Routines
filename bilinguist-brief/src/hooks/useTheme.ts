import { useSettingsStore } from '../store/useSettingsStore';
import { BackgroundColors, Colors, FontFamilies, FontSizes } from '../theme';

// Blue ink shades for the cream theme — deep navy through light blue
const CREAM_INK_DARK  = '#162032'; // navyBg — strong navy for headlines
const CREAM_INK_MID   = '#1E3A5F'; // dark navy for body text
const CREAM_INK_LIGHT = '#2E5FA3'; // medium blue
const CREAM_INK_FAINT = '#4A6FA5'; // lighter blue

export function useTheme() {
  const background    = useSettingsStore((s) => s.background);
  const fontFamilyKey = useSettingsStore((s) => s.fontFamily);
  const fontSizeKey   = useSettingsStore((s) => s.fontSize);

  const isNight = background === 'night';
  const isNavy  = background === 'softGrey';
  const isCream = background === 'cream';
  const isDark  = isNight || isNavy;

  const colors = {
    bg: BackgroundColors[background],
    surface: isNight
      ? Colors.nightSurface
      : isNavy
      ? Colors.navySurface
      : isCream
      ? Colors.creamSurface
      : '#FFFFFF',
    card: isNight
      ? Colors.nightCard
      : isNavy
      ? Colors.navyCard
      : isCream
      ? Colors.creamCard
      : '#FFFFFF',

    // Ink — dark themes use night palette; cream uses blue palette; white uses standard
    inkDark:  isDark ? Colors.nightInkDark  : isCream ? CREAM_INK_DARK  : Colors.inkDark,
    inkMid:   isDark ? Colors.nightInkMid   : isCream ? CREAM_INK_MID   : Colors.inkMid,
    inkLight: isDark ? Colors.nightInkLight : isCream ? CREAM_INK_LIGHT : Colors.inkLight,
    inkFaint: isDark ? Colors.nightInkLight : isCream ? CREAM_INK_FAINT : Colors.inkFaint,

    borderLight: isNight
      ? Colors.borderNight
      : isNavy
      ? Colors.navyBorder
      : Colors.borderLight,
    borderMid: isNight
      ? '#3A3A3A'
      : isNavy
      ? Colors.navyBorderMid
      : Colors.borderMid,

    accentGold: Colors.accentGold,
    accentRed:  Colors.accentRed,

    // chrome = the paired accent ink for the current background
    // (cream→navy, navy→cream, night→cream, white→inkDark)
    chrome: isCream  ? Colors.navyBg
          : isNavy   ? Colors.cream
          : isNight  ? Colors.cream
          : Colors.inkDark,

    isNight,
  };

  const fontFamily = FontFamilies[fontFamilyKey] ?? FontFamilies.garamond;
  const fontSize   = FontSizes[fontSizeKey]      ?? FontSizes.medium;

  return { colors, fontFamily, fontSize, background, isNight, isDark, isCream };
}
