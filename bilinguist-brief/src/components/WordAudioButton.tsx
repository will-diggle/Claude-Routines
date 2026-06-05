import React, { useRef, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { synthesizeWord } from '../services/elevenlabs';
import { useTheme } from '../hooks/useTheme';
import type { LanguageCode } from '../store/useSettingsStore';

interface Props {
  word: string;
  language: LanguageCode;
  size?: 'sm' | 'md';
}

export function WordAudioButton({ word, language, size = 'md' }: Props) {
  const { colors } = useTheme();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);

  async function handlePress() {
    if (state === 'loading') return;

    if (state === 'playing') {
      try { await soundRef.current?.stopAsync(); } catch { /* ignore */ }
      setState('idle');
      return;
    }

    setState('loading');
    const result = await synthesizeWord(word, language);
    if (!result.ok) { setState('idle'); return; }

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync({ uri: result.audioUri }, { shouldPlay: true });
      soundRef.current = sound;
      setState('playing');
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setState('idle');
          soundRef.current = null;
        }
      });
    } catch {
      setState('idle');
    }
  }

  const iconSize = size === 'sm' ? 13 : 17;
  const btnSize = size === 'sm' ? 26 : 34;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.btn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2, borderColor: colors.borderMid }]}
    >
      {state === 'loading' ? (
        <ActivityIndicator size="small" color={colors.inkFaint} />
      ) : (
        <Ionicons
          name={state === 'playing' ? 'stop' : 'volume-high-outline'}
          size={iconSize}
          color={colors.inkMid}
        />
      )}
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
