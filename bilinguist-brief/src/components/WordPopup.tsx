import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore } from '../store/useWordBankStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { lookupWord } from '../services/wordService';
import type { WordEntry } from '../services/wordService';
import { translateWord } from '../services/deepl';
import { writeBackDictionary } from '../services/dictionaryService';
import { synthesizeWord, getMonthlyAudioUsage } from '../services/elevenlabs';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { Spacing } from '../theme';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';
import { GlassButton } from './GlassButton';

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ',
  de: 'PRÄTERITUM',
  es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO',
  sv: 'PRETERITUM',
  en: 'SIMPLE PAST',
  tr: 'GEÇMİŞ ZAMAN',
};

interface Props {
  word: string | null;
  /** Lemma resolved from token map (e.g. "ansehen" for tapped "sehe"). Falls back to word. */
  lemma?: string;
  sentence: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  onClose: () => void;
}

export function WordPopup({ word, lemma, sentence, language, level, genre, onClose }: Props) {
  const lookupLemma = lemma ?? word ?? '';

  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveWord, isWordSaved, backfillWord } = useWordBankStore();
  const { isFullAccess } = useSubscriptionStore();
  const fullAccess = isFullAccess();

  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [quickTranslation, setQuickTranslation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTenseIdx, setActiveTenseIdx] = useState(0);

  const alreadySaved = word ? isWordSaved(word, language) : false;

  // Draggable handle — sheet physically follows finger, springs back or closes
  const dragY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(0, g.dy)); // only allow downward drag
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          onClose();
          dragY.setValue(0);
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!word) return;
    setEntry(null);
    setQuickTranslation(null);
    setIsLoading(true);
    setSaved(false);
    setActiveTenseIdx(0);

    const currentWord = word;
    const currentLemma = lookupLemma;
    const currentLang = language;

    (async () => {
      analytics.trackWordTapped(currentWord, currentLang, level, false);

      translateWord(currentLemma, currentLang).then((result) => {
        if (result?.translation) setQuickTranslation(result.translation);
      }).catch(() => {});

      lookupWord(currentWord, currentLang, level).then((result) => {
        setEntry(result);
        setIsLoading(false);
        if (result) {
          writeBackDictionary(currentLemma, currentLang, result).catch(() => {});
          const stored = useWordBankStore.getState().words.find(
            w => w.word.toLowerCase() === currentWord.toLowerCase() && w.language === currentLang
          );
          if (stored) {
            backfillWord(currentWord, currentLang, {
              translation:   result.translation ?? undefined,
              explanation:   result.explanation ?? undefined,
              lemma:         result.lemma,
              pronunciation: result.pronunciation,
              verbTable:     result.verbTable,
              verbTablePast: result.verbTablePast,
              forms:         result.forms,
              wordType:      result.wordType,
              tip:           result.tip,
              meta:          result.meta,
            });
          }
        }
      }).catch(() => { setIsLoading(false); });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, lookupLemma, language]);

  // Build ordered tense list — prefer rich tenses array from new schema
  const tenses = useMemo(() => {
    if (!entry) return [];
    if (entry.tenses && entry.tenses.length > 0) return entry.tenses;
    const list: Array<{ label: string; table: Record<string, string> }> = [];
    if (entry.verbTable && Object.keys(entry.verbTable).length > 0) {
      list.push({ label: 'PRESENT', table: entry.verbTable });
    }
    if (entry.verbTablePast && Object.keys(entry.verbTablePast).length > 0) {
      list.push({ label: PAST_TENSE_LABEL[language] ?? 'PAST', table: entry.verbTablePast });
    }
    return list;
  }, [entry, language]);

  function handleSave() {
    if (!word || alreadySaved || saved) return;
    analytics.trackWordSaved(word, language, level);
    saveWord({
      word,
      language,
      translation: entry?.translation ?? quickTranslation ?? '',
      explanation: entry?.explanation ?? '',
      exampleSentence: entry?.example ?? '',
      originalSentence: sentence,
      lemma: entry?.lemma ?? null,
      pronunciation: entry?.pronunciation ?? null,
      verbTable: entry?.verbTable ?? null,
      verbTablePast: entry?.verbTablePast ?? null,
      forms: entry?.forms ?? null,
      wordType: entry?.wordType ?? null,
      tip: entry?.tip ?? null,
      meta: entry?.meta ?? null,
    });
    setSaved(true);
  }

  if (!word) return null;

  const isSaved = saved || alreadySaved;
  const displayTranslation = entry?.translation ?? quickTranslation;
  const activeTense = tenses[activeTenseIdx] ?? null;

  // Subtitle line: article forms for nouns, variants for adjectives
  const subtitle = (() => {
    if (!entry?.wordType) return null;
    const wt = entry.wordType;
    const f = entry.forms;
    if (wt === 'noun' && f) {
      const parts: string[] = [];
      if (f.article && entry.lemma) parts.push(`${f.article} ${entry.lemma}`);
      else if (entry.lemma) parts.push(entry.lemma);
      if (f.plural) parts.push(f.plural);
      return parts.length > 1 ? parts.join(' · ') : null;
    }
    if (wt === 'adjective' && f) {
      const parts: string[] = [entry.lemma ?? word];
      if (f.feminine) parts.push(f.feminine);
      if (f.comparative) parts.push(f.comparative);
      return parts.length > 1 ? parts.join(' · ') : null;
    }
    return null;
  })();

  const showLemmaFallback = !subtitle && lookupLemma && lookupLemma.toLowerCase() !== word.toLowerCase();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* Single bg container — corners of sheet blend into same overlay colour */}
      <View style={styles.modalContainer}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
            { transform: [{ translateY: dragY }] },
          ]}
        >
          {/* Drag handle — touch this area to slide sheet down */}
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />
          </View>

          {/* Word row: word (flex:1) · 🔊 · /IPA/ · ✕ */}
          <View style={styles.wordRow}>
            <Text
              style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {word}
            </Text>
            <View style={styles.wordRight}>
              {AUDIO_LANGUAGES_POPUP.includes(language) && (
                <AudioButton word={word} language={language} level={level} genre={genre} compact />
              )}
              {entry?.pronunciation && (
                <Text style={[styles.ipaInline, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  /{entry.pronunciation}/
                </Text>
              )}
              <GlassButton onPress={onClose} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.inkMid} />
              </GlassButton>
            </View>
          </View>

        {/* Subtitle: article/lemma variants */}
        {(subtitle || showLemmaFallback) && (
          <Text style={[styles.subtitle, { color: colors.accentRed, fontFamily: fontFamily.italic }]}>
            {subtitle ?? `← ${lookupLemma}`}
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Translation — centered, large (above chips) */}
        <View style={styles.translationBlock}>
          {displayTranslation ? (
            <Text style={[styles.translationLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {displayTranslation}
            </Text>
          ) : isLoading ? (
            <ActivityIndicator size="small" color={colors.inkFaint} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={[styles.translationError, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              Translation unavailable
            </Text>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        {/* Grammar chips + level pill on the same row */}
        {entry?.wordType && (
          <View style={styles.chipsRow}>
            <View style={[styles.chipFilled, { backgroundColor: colors.accentRed }]}>
              <Text style={[styles.chipFilledText, { color: '#FFF', fontFamily: fontFamily.bold }]}>
                {entry.wordType.charAt(0).toUpperCase() + entry.wordType.slice(1)}
              </Text>
            </View>
            {entry.wordType === 'noun' && entry.forms?.gender && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {entry.forms.gender.charAt(0).toUpperCase() + entry.forms.gender.slice(1)}
                </Text>
              </View>
            )}
            {entry.wordType === 'verb' && entry.meta?.isRegular === true && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Regular</Text>
              </View>
            )}
            {entry.wordType === 'verb' && entry.meta?.isRegular === false && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Irregular</Text>
              </View>
            )}
            {entry.wordType === 'verb' && entry.meta?.auxiliary && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {entry.meta.auxiliary as string}
                </Text>
              </View>
            )}
            {entry.wordType === 'verb' && entry.meta?.isSeparable && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Separable</Text>
              </View>
            )}
            {entry.meta?.verbClass && (
              <View style={[styles.chipOutline, { borderColor: colors.inkFaint }]}>
                <Text style={[styles.chipOutlineText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {entry.meta.verbClass as string}
                </Text>
              </View>
            )}
            {/* Level pill on same row as grammar chips */}
            {entry?.level && (
              <View style={[styles.levelBadge, { borderColor: colors.accentRed }]}>
                <Text style={[styles.levelText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
                  {entry.level}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

          {isLoading && !entry && (
            <View style={styles.loadingBody}>
              <ActivityIndicator size="small" color={colors.inkFaint} />
            </View>
          )}

          {/* Explanation */}
          {entry?.explanation && (
            <Text style={[styles.explanationCentered, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {entry.explanation}
            </Text>
          )}

          {/* Forms grid — nouns / adjectives / adverbs / other */}
          {entry?.forms && Object.keys(entry.forms).length > 0 && (
            <View style={styles.formsGrid}>
              {Object.entries(entry.forms).map(([key, value]) => (
                <View key={key} style={[styles.formBox, { backgroundColor: colors.borderLight }]}>
                  <Text style={[styles.formBoxLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {key.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <Text style={[styles.formBoxValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                    {String(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Example — blockquote (moved ABOVE verb tenses) */}
          {entry?.example && (
            <View style={[styles.blockquote, { borderLeftColor: colors.accentRed }]}>
              <Text style={[styles.blockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                „{entry.example}"
              </Text>
            </View>
          )}

          {/* Verb tenses — circular nav with CENTERED tense title */}
          {tenses.length > 0 && activeTense && (
            <>
              <View style={styles.tenseSectionCenter}>
                <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  VERB TENSES
                </Text>
                {tenses.length > 1 ? (
                  <View style={styles.tenseNav}>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.max(0, i - 1))}
                      disabled={activeTenseIdx === 0}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: activeTenseIdx === 0 ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-back" size={16} color={activeTenseIdx === 0 ? colors.borderMid : colors.inkDark} />
                    </TouchableOpacity>
                    <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                      {activeTense.label}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.min(tenses.length - 1, i + 1))}
                      disabled={activeTenseIdx === tenses.length - 1}
                      style={[styles.tenseNavBtn, {
                        backgroundColor: activeTenseIdx === tenses.length - 1 ? colors.borderLight : colors.borderMid,
                      }]}
                    >
                      <Ionicons name="chevron-forward" size={16} color={activeTenseIdx === tenses.length - 1 ? colors.borderMid : colors.inkDark} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                    {activeTense.label}
                  </Text>
                )}
              </View>
              {Object.entries(activeTense.table).map(([pronoun, form]) => (
                <View key={pronoun} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{pronoun}</Text>
                  <Text style={[styles.conjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{form}</Text>
                </View>
              ))}
            </>
          )}

          {/* Tip */}
          {entry?.tip && (
            <View style={[styles.tipBox, { borderColor: colors.borderMid }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb-outline" size={14} color={colors.accentRed} />
                <Text style={[styles.tipLabel, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>TIP</Text>
              </View>
              <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{entry.tip}</Text>
            </View>
          )}

          {!fullAccess && entry && !entry.explanation && !entry.verbTable && !entry.tenses?.length && (
            <View style={[styles.upgradeRow, { borderColor: colors.borderLight }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.inkFaint} />
              <Text style={[styles.upgradeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                Upgrade to unlock full grammar details
              </Text>
            </View>
          )}

        </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, {
              backgroundColor: isSaved ? colors.borderLight : isLoading ? colors.borderLight : colors.accentRed,
              opacity: isLoading && !isSaved ? 0.5 : 1,
            }]}
            onPress={handleSave}
            disabled={isSaved || isLoading}
          >
            <Ionicons name={isSaved ? 'checkmark-circle' : 'bookmark-outline'} size={18} color={isSaved ? colors.inkLight : '#FFF'} />
            <Text style={[styles.saveText, { color: isSaved ? colors.inkLight : '#FFF', fontFamily: fontFamily.regular }]}>
              {isSaved ? 'Saved to word bank' : 'Save word'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const AUDIO_LANGUAGES_POPUP: LanguageCode[] = ['fr', 'en', 'de', 'sv', 'it', 'es', 'tr'];

function AudioButton({ word, language, level, genre, compact }: { word: string; language: LanguageCode; level: LanguageLevel; genre?: string; compact?: boolean }) {
  const { colors, fontFamily } = useTheme();
  const { state, play, stop } = useAudioPlayer();
  const [capInfo, setCapInfo] = React.useState<{ remaining: number; limit: number } | null>(null);
  const [capReached, setCapReached] = React.useState(false);

  React.useEffect(() => {
    getMonthlyAudioUsage().then((u) => {
      setCapInfo({ remaining: u.remaining, limit: u.limit });
      setCapReached(u.remaining <= 0);
    }).catch(() => {});
  }, []);

  if (!AUDIO_LANGUAGES_POPUP.includes(language)) return null;

  async function handlePress() {
    try {
      if (state === 'playing') { await stop(); return; }
      if (state === 'loading' || capReached) return;
      const result = await synthesizeWord(word, language);
      if (result.ok) {
        analytics.trackAudioPlayed(word, language);
        getMonthlyAudioUsage().then((u) => {
          setCapInfo({ remaining: u.remaining, limit: u.limit });
          setCapReached(u.remaining <= 0);
        }).catch(() => {});
        await play(result.audioUri);
      } else if (result.reason === 'cap_reached') {
        setCapReached(true);
      }
    } catch {}
  }

  const isLoading = state === 'loading';
  const isPlaying = state === 'playing';
  const disabled  = capReached || isLoading;

  if (compact) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ opacity: disabled ? 0.4 : 1 }}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.inkFaint} />
        ) : (
          <Ionicons
            name={isPlaying ? 'stop-circle-outline' : 'volume-high-outline'}
            size={24}
            color={capReached ? colors.inkFaint : colors.inkMid}
          />
        )}
      </TouchableOpacity>
    );
  }

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
  row: { width: '100%', gap: 6, marginBottom: 12 },
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  buttonDisabled: { opacity: 0.45 },
  label: { fontSize: 14 },
  usage: { fontSize: 11, paddingLeft: 2 },
});

const styles = StyleSheet.create({
  // The overlay colour is the container background so rounded corners blend in
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },

  // Handle + drag area — wider hit target so it's easy to grab
  handleArea: { paddingTop: 14, paddingBottom: 8, paddingHorizontal: 40, alignItems: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3 },

  // Word header: word · /IPA/ · 🔊 · ✕
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  wordText: { fontSize: 34, flex: 1 },
  wordRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  ipaInline: { fontSize: 13, letterSpacing: 0.5 },

  subtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },

  // Dividers
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg, marginVertical: Spacing.sm },

  // Translation block (above chips)
  translationBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  translationLarge: { fontSize: 26, textAlign: 'center' },
  translationError: { fontSize: 14, textAlign: 'center' },

  // Chips row (grammar + level pill)
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
    justifyContent: 'center',
  },
  chipFilled: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipFilledText: { fontSize: 13, letterSpacing: 0.3 },
  chipOutline: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipOutlineText: { fontSize: 13 },
  levelBadge: {
    height: 32, minWidth: 32, paddingHorizontal: 10,
    borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  levelText: { fontSize: 12, letterSpacing: 0.5 },

  // Scroll body
  scrollArea: { paddingHorizontal: Spacing.lg },
  loadingBody: { paddingVertical: Spacing.xl, alignItems: 'center' },
  explanationCentered: { lineHeight: 24, textAlign: 'center', paddingVertical: Spacing.sm },

  // Forms grid
  formsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  formBox: {
    width: '47.5%',
    borderRadius: 10, padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  formBoxLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  formBoxValue: { fontSize: 18 },

  // Blockquote example (now above verb tenses)
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 10, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  blockquoteText: { lineHeight: 22 },

  // Verb tenses — centered layout
  tenseSectionCenter: {
    alignItems: 'center',
    marginTop: Spacing.md, marginBottom: Spacing.xs,
  },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  tenseNavBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, minWidth: 110, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },

  // Tip box
  tipBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 14, marginTop: Spacing.sm, marginBottom: Spacing.md },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipLabel: { fontSize: 11, letterSpacing: 1.5 },
  tipText: { fontSize: 13, lineHeight: 20 },

  // Upgrade nudge
  upgradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: Spacing.md, marginBottom: Spacing.md, opacity: 0.6,
  },
  upgradeText: { fontSize: 13 },

  // Save button
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.lg, marginTop: 6,
    paddingVertical: 14, borderRadius: 10, gap: Spacing.sm,
  },
  saveText: { fontSize: 16 },
});
