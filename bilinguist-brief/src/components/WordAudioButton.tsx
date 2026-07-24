import React, { useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../hooks/useTheme';
import { GlassButton } from './GlassButton';
import type { LanguageCode } from '../store/useSettingsStore';

// Uses Google Translate's unofficial TTS endpoint — free for short words.
// No API key required.

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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
      soundRef.current = null;
      setState('idle');
      return;
    }

    setState('loading');

    try {
      const url =
        `https://translate.google.com/translate_tts` +
        `?ie=UTF-8&q=${encodeURIComponent(word)}&tl=${language}&client=tw-ob`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) { setState('idle'); return; }

      const buffer = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const audioUri = `data:audio/mpeg;base64,${base64}`;

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
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
  const btnSize  = size === 'sm' ? 26 : 34;

  return (
    <GlassButton onPress={handlePress} size={btnSize} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      {state === 'loading' ? (
        <ActivityIndicator size="small" color={colors.inkFaint} />
      ) : (
        <Ionicons
          name={state === 'playing' ? 'stop' : 'volume-high-outline'}
          size={iconSize}
          color={colors.inkMid}
        />
      )}
    </GlassButton>
  );
}
