import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore } from '../store/useWordBankStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { translateWord } from '../services/deepl';
import { explainWord } from '../services/wordLookup';
import { synthesizeWord, getMonthlyAudioUsage } from '../services/elevenlabs';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { Spacing } from '../theme';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import type { WordExplanation } from '../services/wordLookup';

interface Props {
  word: string | null;
  sentence: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;   // ← add this
  onClose: () => void;
}

export function WordPopup({ word, sentence, language, level, genre, onClose }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveWord, isWordSaved } = useWordBankStore();
  const { isFullAccess } = useSubscriptionStore();
  const fullAccess = isFullAccess();

  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [saved, setSaved] = useState(false);

  const alreadySaved = word ? isWordSaved(word, language) : false;

  // Reset and fetch translation whenever word changes
  useEffect(() => {
    if (!word) return;
    setTranslation(null);
    setExplanation(null);
    setSaved(false);
    setIsTranslating(true);

    translateWord(word, language).then((result) => {
      setTranslation(result?.translation ?? null);
      setIsTranslating(false);
    });
  }, [word, language]);

  async function handleTellMeMore() {
    if (!word || explanation || isExplaining) return;
    setIsExplaining(true);
    const result = await explainWord(word, sentence, language, level);
    setExplanation(result);
    setIsExplaining(false);
  }

  function handleSave() {
    if (!word || alreadySaved || saved) return;
    saveWord({
      word,
      language,
      translation: translation ?? '',
      explanation: explanation?.explanation ?? '',
      exampleSentence: explanation?.example ?? '',
      originalSentence: sentence,
    });
    setSaved(true);
  }

  if (!word) return null;

  const isSaved = saved || alreadySaved;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + Spacing.lg,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.word, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {word}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.inkLight} />
          </TouchableOpacity>
        </View>

        {/* Translation */}
        <View style={[styles.translationRow, { borderTopColor: colors.borderLight, borderBottomColor: colors.borderLight }]}>
          {isTranslating ? (
            <ActivityIndicator size="small" color={colors.inkFaint} />
          ) : translation ? (
            <>
              <Text style={[styles.translationLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                EN
              </Text>
              <Text style={[styles.translation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {translation}
              </Text>
            </>
          ) : null}
        </View>

        {/* Original sentence */}
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sentenceLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            IN CONTEXT
          </Text>
          <Text style={[styles.sentence, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
            "{sentence}"
          </Text>

          {/* Audio pronunciation */}
          {translation && (
            <AudioButton word={word} language={language} level={level} genre={genre} />
          )}

          {/* Tell me more — paid only */}
          {!explanation && !isExplaining && (
            fullAccess ? (
              <TouchableOpacity
                style={[styles.tellMore, { borderColor: colors.borderMid }]}
                onPress={handleTellMeMore}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.accentGold} />
                <Text style={[styles.tellMoreText, { color: colors.accentGold, fontFamily: fontFamily.regular }]}>
                  Tell me more
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.tellMore, { borderColor: colors.borderLight, opacity: 0.6 }]}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.inkFaint} />
                <Text style={[styles.tellMoreText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Tell me more · upgrade to unlock
                </Text>
              </View>
            )
          )}

          {isExplaining && (
            <View style={styles.explaining}>
              <ActivityIndicator size="small" color={colors.accentGold} />
              <Text style={[styles.explainingText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                Claude is explaining…
              </Text>
            </View>
          )}

          {explanation && (
            <View style={[styles.explanationBox, { borderLeftColor: colors.accentGold }]}>
              <Text style={[styles.explanationText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {explanation.explanation}
              </Text>

              {explanation.example ? (
                <>
                  <Text style={[styles.explanationSubLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    EXAMPLE
                  </Text>
                  <Text style={[styles.exampleText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                    {explanation.example}
                  </Text>
                </>
              ) : null}

              {explanation.pronunciation ? (
                <>
                  <Text style={[styles.explanationSubLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    PRONUNCIATION
                  </Text>
                  <Text style={[styles.pronunciationText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                    /{explanation.pronunciation}/
                  </Text>
                </>
              ) : null}
            </View>
          )}
        </ScrollView>

        {/* Save button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            {
              backgroundColor: isSaved ? colors.borderLight : colors.accentGold,
            },
          ]}
          onPress={handleSave}
          disabled={isSaved}
        >
          <Ionicons
            name={isSaved ? 'checkmark-circle' : 'bookmark-outline'}
            size={18}
            color={isSaved ? colors.inkLight : '#FFF'}
          />
          <Text style={[styles.saveText, { color: isSaved ? colors.inkLight : '#FFF', fontFamily: fontFamily.regular }]}>
            {isSaved ? 'Saved to word bank' : 'Save word'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// Languages supported by ElevenLabs eleven_multilingual_v2
const AUDIO_LANGUAGES_POPUP: LanguageCode[] = ['fr', 'en', 'de', 'sv', 'it', 'es'];

function AudioButton({ word, language, level, genre }: { word: string; language: LanguageCode; level: LanguageLevel; genre?: string }) {
  const { colors, fontFamily } = useTheme();
  const { state, play, stop } = useAudioPlayer();
  const [capInfo, setCapInfo] = React.useState<{ remaining: number; limit: number } | null>(null);
  const [capReached, setCapReached] = React.useState(false);

  React.useEffect(() => {
    getMonthlyAudioUsage().then((u) => {
      setCapInfo({ remaining: u.remaining, limit: u.limit });
      setCapReached(u.remaining <= 0);
    });
  }, []);

  // Only render for languages the TTS model supports
  if (!AUDIO_LANGUAGES_POPUP.includes(language)) return null;

  async function handlePress() {
    if (state === 'playing') { await stop(); return; }
    if (state === 'loading' || capReached) return;
    const result = await synthesizeWord(word, language);
    if (result.ok) {
      // Refresh cap counter after playing
      getMonthlyAudioUsage().then((u) => {
        setCapInfo({ remaining: u.remaining, limit: u.limit });
        setCapReached(u.remaining <= 0);
      });
      await play(result.audioUri);
    } else if (result.reason === 'cap_reached') {
      setCapReached(true);
    }
  }

  const isLoading = state === 'loading';
  const isPlaying = state === 'playing';
  const disabled  = capReached || isLoading;

  return (
    <View style={audioStyles.row}>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        style={[
          audioStyles.button,
          { borderColor: colors.borderMid },
          disabled && audioStyles.buttonDisabled,
        ]}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.inkFaint} />
        ) : (
          <Ionicons
            name={isPlaying ? 'stop-circle-outline' : 'volume-high-outline'}
            size={18}
            color={capReached ? colors.inkFaint : colors.inkMid}
          />
        )}
        <Text
          style={[
            audioStyles.label,
            { color: capReached ? colors.inkFaint : colors.inkMid, fontFamily: fontFamily.regular },
          ]}
        >
          {capReached ? 'Monthly limit reached' : isPlaying ? 'Stop' : 'Hear pronunciation'}
        </Text>
      </TouchableOpacity>

      {capInfo && !capReached && (
        <Text style={[audioStyles.usage, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          {capInfo.remaining} / {capInfo.limit} plays left today
        </Text>
      )}
    </View>
  );
}

const audioStyles = StyleSheet.create({
  row: {
    width: '100%',
    gap: 6,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 14,
  },
  usage: {
    fontSize: 11,
    paddingLeft: 2,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  word: {
    flex: 1,
  },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
    minHeight: 48,
  },
  translationLabel: {
    fontSize: 10,
    letterSpacing: 1,
    width: 24,
  },
  translation: {
    flex: 1,
  },
  noKey: {
    flex: 1,
    fontSize: 13,
  },
  scrollArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    flexGrow: 0,
  },
  sentenceLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  sentence: {
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  tellMore: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tellMoreText: {
    fontSize: 14,
  },
  explaining: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  explainingText: {
    fontSize: 13,
  },
  explanationBox: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  explanationText: {
    lineHeight: 24,
  },
  explanationSubLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: Spacing.xs,
  },
  exampleText: {
    lineHeight: 22,
  },
  pronunciationText: {
    fontSize: 15,
    letterSpacing: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: 14,
    borderRadius: 8,
    gap: Spacing.sm,
  },
  saveText: {
    fontSize: 16,
  },
});
