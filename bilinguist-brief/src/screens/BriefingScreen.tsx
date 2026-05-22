import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import type { ArticleLength } from '../services/anthropic';
import type { LanguageLevel } from '../store/useSettingsStore';

function formatReceivedAt(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

// A1/A2 always use 'short'; B1+ use the user's chosen read length.
function resolveLength(level: LanguageLevel, readLength: 'medium' | 'longer'): ArticleLength {
  return level === 'A1' || level === 'A2' ? 'short' : readLength;
}

export function BriefingScreen() {
  const { colors } = useTheme();
  const settings = useSettingsStore();
  const { briefings, generatingFor, errorsFor, weather, isLoadingWeather, syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt } =
    useBriefingStore();

  const activeLanguages = settings.languages.filter((l) => l.active);

  // Includes readLength so switching depth instantly re-loads the correct cached variant
  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}`).join(',') +
    `:${settings.readLength}`;

  useEffect(() => {
    const langs = settings.languages.filter((l) => l.active);
    // Try server bundle first; loadBriefing below falls back to on-device generation if sync fails or is slow
    syncFromServer();
    langs.forEach((lang) => {
      const level = lang.level ?? 'B1';
      loadBriefing(lang.code, level, resolveLength(level, settings.readLength), false);
    });
    if (langs.length > 0) loadWeather(langs[0].code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <WeatherStrip weather={weather} isLoading={isLoadingWeather} />

      {bundleReceivedAt != null && (
        <View style={[styles.mastDate, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.mastDateText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
            {formatReceivedAt(bundleReceivedAt)}
          </Text>
        </View>
      )}

      {activeLanguages.map((lang, index) => {
        const level = lang.level ?? 'B1';
        const length = resolveLength(level, settings.readLength);
        return (
          <LanguageBriefingSection
            key={lang.code}
            langCode={lang.code}
            nativeName={lang.nativeName}
            level={level}
            briefing={briefings[lang.code]}
            isGenerating={generatingFor.includes(lang.code)}
            error={errorsFor[lang.code]}
            isFirst={index === 0}
            topics={settings.topics}
            onRetry={() => {
              clearError(lang.code);
              loadBriefing(lang.code, level, length, true);
            }}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },
  mastDate: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  mastDateText: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
});
