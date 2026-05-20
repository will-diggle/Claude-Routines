import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { BriefingArticle } from '../components/BriefingArticle';
import { BriefingLoading } from '../components/BriefingLoading';
import { Spacing } from '../theme';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
};

function formatNewspaperDate(language: string): string {
  const locale = LOCALE_MAP[language] ?? 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date())
    .toUpperCase();
}

export function BriefingScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const settings = useSettingsStore();
  const { briefing, weather, isGenerating, isLoadingWeather, error, loadBriefing, loadWeather, clearError } =
    useBriefingStore();

  const activeLang = settings.languages.find((l) => l.code === settings.displayLanguage);
  const language = settings.displayLanguage;
  const level = activeLang?.level ?? 'B1';

  const triggerLoad = useCallback(
    (force = false) => {
      loadWeather(language);
      loadBriefing(language, level, settings.briefingLength, settings.topics, force);
    },
    [language, level, settings.briefingLength, settings.topics]
  );

  useEffect(() => {
    triggerLoad(false);
  }, [language, level]);

  const hasBriefing = briefing && briefing.language === language && briefing.level === level;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isGenerating}
          onRefresh={() => triggerLoad(true)}
          tintColor={colors.inkFaint}
        />
      }
    >
      <WeatherStrip weather={weather} isLoading={isLoadingWeather} />

      {/* Newspaper edition header */}
      <View style={[styles.editionRow, { borderBottomColor: colors.inkDark, borderTopColor: colors.inkDark }]}>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.editionText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {activeLang?.name.toUpperCase() ?? 'ENGLISH'} EDITION · {level}
        </Text>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
      </View>

      <Text style={[styles.dateText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        {formatNewspaperDate(language)}
      </Text>

      <View style={[styles.mastRule, { backgroundColor: colors.inkDark }]} />

      {/* States */}
      {isGenerating && !hasBriefing && <BriefingLoading />}

      {error && (
        <View style={styles.centerBlock}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.inkFaint} />
          <Text style={[styles.errorText, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.button, { borderColor: colors.borderMid }]}
            onPress={() => { clearError(); triggerLoad(true); }}
          >
            <Text style={[styles.buttonText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isGenerating && !error && !hasBriefing && (
        <View style={styles.centerBlock}>
          <Text style={[styles.emptyHeadline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            Your briefing awaits
          </Text>
          <Text style={[styles.emptyBody, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            Claude will search today's news and write a fresh briefing in {activeLang?.name ?? 'your language'} at {level} level.
          </Text>
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.accentGold }]}
            onPress={() => triggerLoad(true)}
          >
            <Text style={[styles.generateButtonText, { fontFamily: fontFamily.regular }]}>
              Generate Today's Briefing
            </Text>
          </TouchableOpacity>
          <Text style={[styles.generateNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Takes 20–40 seconds · Cached for the day
          </Text>
        </View>
      )}

      {hasBriefing && briefing && (
        <>
          {briefing.articles.map((article, index) => (
            <BriefingArticle
              key={`${article.section}-${index}`}
              article={article}
              isLast={index === briefing.articles.length - 1}
            />
          ))}

          <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
            <Text style={[styles.footerText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              Pull down to refresh · Generated by Claude with live web search
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },
  editionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    marginTop: Spacing.sm,
  },
  editionRule: { flex: 1, height: 1 },
  editionText: { fontSize: 11, letterSpacing: 1.5, paddingHorizontal: Spacing.sm },
  dateText: {
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 0.5,
    paddingVertical: Spacing.sm,
  },
  mastRule: { height: 1, marginHorizontal: Spacing.md, marginBottom: Spacing.xs },
  centerBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  emptyHeadline: {
    textAlign: 'center',
    lineHeight: 36,
  },
  emptyBody: {
    textAlign: 'center',
    lineHeight: 26,
  },
  errorText: {
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  buttonText: { fontSize: 15 },
  generateButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  generateButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
  generateNote: {
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  footerText: { fontSize: 12 },
});
