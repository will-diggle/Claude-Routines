import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import type { BackgroundKey } from '../theme';
import type { LanguageCode } from '../store/useSettingsStore';

const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const GREETINGS: Record<string, [string, string, string, string]> = {
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
  if (h >= 5  && h < 12) return 0;
  if (h >= 12 && h < 17) return 1;
  if (h >= 17 && h < 21) return 2;
  return 3;
}

const SW = Dimensions.get('window').width;
const LOGO_W = SW * 0.72;
const LOGO_H = Math.round(LOGO_W / 5.17);

const FADE_MS  = 400;
const HOLD_MS  = 700;
const SPLASH_MS = 3200;

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const { colors, background, fontFamily } = useTheme();

  const activeLanguageCodes = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code as LanguageCode))
  );

  const timeIdx = useMemo(() => getTimeOfDayIndex(), []);

  const phrases = useMemo(() => {
    const langs = activeLanguageCodes.length > 0 ? activeLanguageCodes : ['en' as LanguageCode];
    return langs.map((l) => GREETINGS[l]?.[timeIdx] ?? GREETINGS.en[timeIdx]);
  }, [activeLanguageCodes, timeIdx]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let idx = 0;

    function cycle() {
      if (cancelled) return;
      Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start(() => {
        if (cancelled) return;
        const holdTimer = setTimeout(() => {
          if (cancelled) return;
          Animated.timing(fadeAnim, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
            if (cancelled) return;
            idx = (idx + 1) % phrases.length;
            setPhraseIdx(idx);
            cycle();
          });
        }, HOLD_MS);
        return () => clearTimeout(holdTimer);
      });
    }

    cycle();

    const doneTimer = setTimeout(onDone, SPLASH_MS);

    return () => {
      cancelled = true;
      clearTimeout(doneTimer);
      fadeAnim.stopAnimation();
    };
  }, [onDone]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Image
        source={MASTHEADS[background as BackgroundKey] ?? MASTHEADS.cream}
        style={{ width: LOGO_W, height: LOGO_H }}
        resizeMode="contain"
      />
      <Animated.Text
        style={[styles.greeting, { color: colors.inkDark, fontFamily: fontFamily.italic, opacity: fadeAnim }]}
      >
        {phrases[phraseIdx] ?? ''}
      </Animated.Text>
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
    gap: 28,
  },
  greeting: {
    fontSize: 18,
    letterSpacing: 0.3,
  },
});
