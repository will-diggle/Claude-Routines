import React, { useEffect, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import type { BackgroundKey } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';

const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const GREETINGS: Record<string, [string, string, string, string]> = {
  // [morning, afternoon, evening, night]
  en: ['Good morning',        'Good afternoon',       'Good evening',   'Good night'],
  fr: ['Bonjour',             'Bon après-midi',       'Bonsoir',        'Bonne nuit'],
  de: ['Guten Morgen',        'Guten Tag',            'Guten Abend',    'Gute Nacht'],
  sv: ['God morgon',          'God eftermiddag',      'God kväll',      'God natt'],
  it: ['Buongiorno',          'Buon pomeriggio',      'Buona sera',     'Buonanotte'],
  es: ['Buenos días',         'Buenas tardes',        'Buenas noches',  'Buenas noches'],
  tr: ['Günaydın',            'İyi öğleden sonralar', 'İyi akşamlar',   'İyi geceler'],
};

function getTimeOfDayIndex(): number {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 0; // morning
  if (h >= 12 && h < 17) return 1; // afternoon
  if (h >= 17 && h < 21) return 2; // evening
  return 3;                          // night
}

const SW = Dimensions.get('window').width;
const LOGO_W = SW * 0.72;
const LOGO_H = Math.round(LOGO_W / 5.17);

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const { colors, background, fontFamily } = useTheme();
  const activeLanguages = useSettingsStore((s) => s.activeLanguages().map((l) => l.code as LanguageCode));
  const displayName = useAuthStore((s) => s.displayName);

  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  const timeIdx = useMemo(() => getTimeOfDayIndex(), []);
  const greeting = useMemo(() => {
    const langs = activeLanguages.length > 0 ? activeLanguages : ['en' as LanguageCode];
    // Primary greeting (first active language) may include user's name
    const primary = langs[0];
    const base = GREETINGS[primary]?.[timeIdx] ?? GREETINGS.en[timeIdx];
    const primaryLine = displayName ? `${base}, ${displayName.split(' ')[0]}` : base;
    // Secondary greetings (remaining languages, up to 3 more)
    const secondaries = langs.slice(1, 4).map(
      (l) => GREETINGS[l]?.[timeIdx] ?? GREETINGS.en[timeIdx]
    );
    return { primary: primaryLine, secondaries };
  }, [activeLanguages, timeIdx, displayName]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Image
        source={MASTHEADS[background as BackgroundKey] ?? MASTHEADS.cream}
        style={{ width: LOGO_W, height: LOGO_H }}
        resizeMode="contain"
      />
      <View style={styles.greetingBlock}>
        <Text style={[styles.primaryGreeting, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {greeting.primary}
        </Text>
        {greeting.secondaries.map((line, i) => (
          <Text key={i} style={[styles.secondaryGreeting, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export async function shouldShowSplash(): Promise<boolean> {
  return true;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  greetingBlock: {
    alignItems: 'center',
    gap: 6,
  },
  primaryGreeting: {
    fontSize: 22,
    letterSpacing: 0.3,
  },
  secondaryGreeting: {
    fontSize: 15,
    opacity: 0.75,
  },
});
