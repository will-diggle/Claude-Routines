import { useSettingsStore } from '../store/useSettingsStore';
import { BackgroundColors, Colors, FontFamilies, FontSizes } from '../theme';

export function useTheme() {
  const { background, fontFamily: fontFamilyKey, fontSize: fontSizeKey } = useSettingsStore();

  const isNight = background === 'night';
  const isNavy = background === 'softGrey';
  const isDark = isNight || isNavy;

  const colors = {
    bg: BackgroundColors[background],
    surface: isNight
      ? Colors.nightSurface
      : isNavy
      ? Colors.navySurface
      : '#FFFFFF',
    card: isNight
      ? Colors.nightCard
      : isNavy
      ? Colors.navyCard
      : '#FFFFFF',
    inkDark: isDark ? Colors.nightInkDark : Colors.inkDark,
    inkMid: isDark ? Colors.nightInkMid : Colors.inkMid,
    inkLight: isDark ? Colors.nightInkLight : Colors.inkLight,
    inkFaint: isDark ? Colors.nightInkLight : Colors.inkFaint,
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
    accentRed: Colors.accentRed,
    isNight,
  };

  const fontFamily = FontFamilies[fontFamilyKey] ?? FontFamilies.playfair;
  const fontSize = FontSizes[fontSizeKey] ?? FontSizes.medium;

  return { colors, fontFamily, fontSize, background, isNight, isDark };
}
