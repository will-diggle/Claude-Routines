import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useTheme } from '../hooks/useTheme';
import type { LanguageCode } from '../store/useSettingsStore';

// ── Demo mode: device TTS instead of ElevenLabs ───────────────────────────────
// Swap DEMO_MODE to false and restore the ElevenLabs import when credits are live

const DEMO_MODE = true;

const LANG_LOCALE: Record<LanguageCode, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  sv: 'sv-SE',
  en: 'en-GB',
  it: 'it-IT',
  es: 'es-ES',
  tr: 'tr-TR',
};

interface Props {
  word: string;
  language: LanguageCode;
  size?: 'sm' | 'md';
}

export function WordAudioButton({ word, language, size = 'md' }: Props) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);

  function handlePress() {
    if (playing) {
      Speech.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    Speech.speak(word, {
      language: LANG_LOCALE[language] ?? 'en-GB',
      rate: 0.82,
      onDone:    () => setPlaying(false),
      onStopped: () => setPlaying(false),
      onError:   () => setPlaying(false),
    });
  }

  const iconSize = size === 'sm' ? 13 : 17;
  const btnSize  = size === 'sm' ? 26 : 34;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.btn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2, borderColor: colors.borderMid }]}
    >
      <Ionicons
        name={playing ? 'stop' : 'volume-high-outline'}
        size={iconSize}
        color={colors.inkMid}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
