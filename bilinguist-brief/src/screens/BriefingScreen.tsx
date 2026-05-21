import React, { useEffect, useCallback, useState } from 'react';
import { ScrollView, RefreshControl, Modal, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import { PaywallScreen } from './PaywallScreen';

export function BriefingScreen() {
  const { colors } = useTheme();
  const settings = useSettingsStore();
  const { briefings, generatingFor, errorsFor, weather, isLoadingWeather, loadBriefing, loadWeather, clearError } =
    useBriefingStore();
  const { isFullAccess } = useSubscriptionStore();
  const [paywallVisible, setPaywallVisible] = useState(false);

  const fullAccess = isFullAccess();
  const activeLanguages = settings.languages.filter((l) => l.active);

  // Stable dep string — re-triggers when active languages or their levels change
  const activeLangKey = activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}`).join(',');

  useEffect(() => {
    const langs = settings.languages.filter((l) => l.active);
    langs.forEach((lang) => {
      loadBriefing(lang.code, lang.level ?? 'B1', settings.briefingLength, settings.topics, false, !fullAccess);
    });
    if (langs.length > 0) loadWeather(langs[0].code);
  // activeLangKey is the serialised version of what matters here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  const isAnyGenerating = activeLanguages.some((l) => generatingFor.includes(l.code));

  const handleRefresh = useCallback(() => {
    const langs = settings.languages.filter((l) => l.active);
    langs.forEach((lang) => {
      loadBriefing(lang.code, lang.level ?? 'B1', settings.briefingLength, settings.topics, true, !fullAccess);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey, settings.briefingLength, settings.topics, fullAccess]);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isAnyGenerating}
          onRefresh={handleRefresh}
          tintColor={colors.inkFaint}
        />
      }
    >
      <WeatherStrip weather={weather} isLoading={isLoadingWeather} />

      {activeLanguages.map((lang, index) => {
        const level = lang.level ?? 'B1';
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
            fullAccess={fullAccess}
            onGenerate={() =>
              loadBriefing(lang.code, level, settings.briefingLength, settings.topics, true, !fullAccess)
            }
            onRetry={() => {
              clearError(lang.code);
              loadBriefing(lang.code, level, settings.briefingLength, settings.topics, true, !fullAccess);
            }}
            onLockedWordPress={() => setPaywallVisible(true)}
            onUpgradePress={() => setPaywallVisible(true)}
          />
        );
      })}

      <Modal visible={paywallVisible} animationType="slide" presentationStyle="pageSheet">
        <PaywallScreen onClose={() => setPaywallVisible(false)} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },
});
