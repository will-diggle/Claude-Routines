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

const PHRASE_POOL: Record<string, string[]> = {
  en: ['Hello', 'Good morning', 'Good afternoon', 'Good evening', 'Welcome', 'Your daily brief', "Today's news", 'Hi there', 'Loading your brief', 'Good to see you'],
  fr: ['Bonjour', 'Bonsoir', 'Salut', 'Bienvenue', 'Bon après-midi', 'Votre brief du jour', 'Les actualités du jour', 'Ravi de vous voir'],
  de: ['Hallo', 'Guten Morgen', 'Guten Tag', 'Servus', 'Willkommen', 'Guten Abend', 'Ihr täglicher Brief', 'Schön, Sie zu sehen'],
  sv: ['Hej', 'God morgon', 'God eftermiddag', 'Välkommen', 'Hej hej', 'Dagens nyheter', 'God kväll'],
  it: ['Ciao', 'Buongiorno', 'Benvenuto', 'Buona sera', 'Salve', 'Le notizie di oggi', 'Ben trovato'],
  es: ['Hola', 'Buenos días', 'Buenas tardes', 'Bienvenido', 'Buenas noches', 'Las noticias de hoy', 'Qué tal'],
  tr: ['Merhaba', 'Günaydın', 'Hoş geldiniz', 'İyi akşamlar', 'Selam', 'Günlük haberler', 'Nasılsınız'],
};

function pickPhrases(langs: string[]): string[] {
  return langs.map((l) => {
    const pool = PHRASE_POOL[l] ?? PHRASE_POOL.en;
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

const SW = Dimensions.get('window').width;
const LOGO_W = SW * 0.88;
const LOGO_H = Math.round(LOGO_W / 5.17);

const FADE_MS  = 220;
const HOLD_MS  = 380;
const SPLASH_MS = 3200;

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const { colors, background, fontFamily } = useTheme();

  const activeLanguageCodes = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code as LanguageCode))
  );

  const phrases = useMemo(() => {
    const langs = activeLanguageCodes.length > 0 ? activeLanguageCodes : ['en' as LanguageCode];
    return pickPhrases(langs);
  }, [activeLanguageCodes]);

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
