import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import { playArticleAudio, pauseAudio } from '../services/audioPlayer';
import { useAudioStore } from '../store/useAudioStore';
import type { BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

// ─── Article-level play / pause button ───────────────────────────────────────

interface AudioBtnProps {
  headline: string;
  body: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  date: string;
}

function makeAudioKey(lang: string, date: string, headline: string): string {
  const slug = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/-$/, '');
  return `${lang}/${date}/${slug}`;
}

function ArticleAudioButton({ headline, body, language, date }: AudioBtnProps) {
  const { colors } = useTheme();
  const { isPlaying, isLoading, headline: activeHeadline } = useAudioStore();

  const isThisPlaying = isPlaying && activeHeadline === headline;
  const isThisLoading = isLoading && activeHeadline === headline;

  async function handlePress() {
    try {
      if (isThisLoading) return;
      if (isThisPlaying) {
        await pauseAudio();
        return;
      }
      const audioKey = makeAudioKey(language, date, headline);
      await playArticleAudio(`${headline}. ${body}`, language, headline, audioKey);
    } catch {}
  }

  // Button colour = opposite of the current theme background
  const btnColor = colors.chrome;
  const iconColor = colors.bg === '#162032' || colors.bg === '#141414' || colors.bg === '#F5F0E8'
    ? '#FFF'
    : '#FFF';

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[styles.audioBtn, { backgroundColor: btnColor }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {isThisLoading ? (
        <ActivityIndicator size="small" color={colors.bg} />
      ) : (
        <Ionicons
          name={isThisPlaying ? 'pause' : 'play'}
          size={13}
          color={colors.bg}
          style={isThisPlaying ? undefined : { marginLeft: 2 }}
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
  date: string;
  locked?: boolean;
  onLockedWordPress?: () => void;
}

export function BriefingArticle({ article, isLast, language, level, genre, date, locked, onLockedWordPress }: Props) {
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
        <TappableText
          text={article.headline}
          style={[
            styles.headline,
            { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading, flex: 1 },
          ]}
          activeWord={activeWord}
          onWordPress={handleWordPress}
        />

        {genre?.toUpperCase() === 'GLOBAL NEWS' && (
          <ArticleAudioButton
            headline={article.headline}
            body={article.body}
            language={language}
            level={level}
            genre={genre}
            date={date}
          />
        )}
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

  // Round play / pause button — filled with accent colour
  audioBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
