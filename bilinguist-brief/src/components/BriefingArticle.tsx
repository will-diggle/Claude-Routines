import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import { synthesizeWord } from '../services/elevenlabs';
import type { BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

// ─── Article-level play / pause button ───────────────────────────────────────

interface AudioBtnProps {
  headline: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
}

// Languages supported by ElevenLabs eleven_multilingual_v2
const AUDIO_LANGUAGES: LanguageCode[] = ['fr', 'en', 'de', 'sv'];

function ArticleAudioButton({ headline, language, level, genre }: AudioBtnProps) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);

  // Only render for languages the TTS model supports
  if (!AUDIO_LANGUAGES.includes(language)) return null;

  async function handlePress() {
    if (status === 'loading') return;

    // Pause if already playing
    if (status === 'playing' && soundRef.current) {
      await soundRef.current.pauseAsync();
      setStatus('idle');
      return;
    }

    // Resume if sound already loaded
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setStatus('playing');
      return;
    }

    // First press — synthesise and play
    setStatus('loading');
    const result = await synthesizeWord(headline, language);
    if (!result.ok) { setStatus('idle'); return; }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: result.audioUri },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setStatus('playing');

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setStatus('idle');
          soundRef.current = null;
        }
      });
    } catch {
      setStatus('idle');
    }
  }

  const isLoading = status === 'loading';
  const isPlaying = status === 'playing';

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[styles.audioBtn, { borderColor: colors.borderMid }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.inkMid} />
      ) : (
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={13}
          color={colors.inkMid}
          style={isPlaying ? undefined : { marginLeft: 2 }} // optical nudge for play triangle
        />
      )}
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  article: Article;
  isLast: boolean;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  locked?: boolean;
  onLockedWordPress?: () => void;
}

export function BriefingArticle({ article, isLast, language, level, genre, locked, onLockedWordPress }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [activeSentence, setActiveSentence] = useState('');

  function handleWordPress(word: string, sentence: string) {
    if (locked) { onLockedWordPress?.(); return; }
    setActiveWord(word);
    setActiveSentence(sentence);
  }

  function handleClose() {
    setActiveWord(null);
  }

  return (
    <View style={styles.container}>

      {/* Headline row — text + round play button */}
      <View style={styles.headlineRow}>
        <Text
          style={[
            styles.headline,
            { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading, flex: 1 },
          ]}
        >
          {article.headline}
        </Text>

        <ArticleAudioButton
          headline={article.headline}
          language={language}
          level={level}
          genre={genre}
        />
      </View>

      <TappableText
        text={article.body}
        style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
        activeWord={activeWord}
        onWordPress={handleWordPress}
      />

      {!isLast && <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />}

      {activeWord && (
        <WordPopup
          word={activeWord}
          sentence={activeSentence}
          language={language}
          level={level}
          genre={genre}
          onClose={handleClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },

  // Headline sits in a row so the audio button can float to the right
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: 10,
  },
  headline: {
    lineHeight: 36,
    // flex: 1 set inline so headline wraps and button stays pinned right
  },

  // Round play / pause button
  audioBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4, // align with first line of headline
    flexShrink: 0,
  },

  body: {
    lineHeight: 28,
    marginBottom: Spacing.lg,
    textAlign: 'justify',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
});
