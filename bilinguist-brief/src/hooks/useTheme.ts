import { useSettingsStore } from '../store/useSettingsStore';
import { BackgroundColors, Colors, FontFamilies, FontSizes } from '../theme';

export function useTheme() {
  const { background, fontFamily: fontFamilyKey, fontSize: fontSizeKey } = useSettingsStore();

  const isNight = background === 'night';

  const colors = {
    bg: BackgroundColors[background],
    surface: isNight ? Colors.nightSurface : '#FFFFFF',
    card: isNight ? Colors.nightCard : '#FFFFFF',
    inkDark: isNight ? Colors.nightInkDark : Colors.inkDark,
    inkMid: isNight ? Colors.nightInkMid : Colors.inkMid,
    inkLight: isNight ? Colors.nightInkLight : Colors.inkLight,
    inkFaint: isNight ? Colors.nightInkLight : Colors.inkFaint,
    borderLight: isNight ? Colors.borderNight : Colors.borderLight,
    borderMid: isNight ? '#3A3A3A' : Colors.borderMid,
    accentGold: Colors.accentGold,
    accentRed: Colors.accentRed,
    isNight,
  };

  const fontFamily = FontFamilies[fontFamilyKey] ?? FontFamilies.playfair;
  const fontSize = FontSizes[fontSizeKey] ?? FontSizes.medium;

  return { colors, fontFamily, fontSize, background, isNight };
}
