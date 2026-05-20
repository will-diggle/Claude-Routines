import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { BriefingArticle } from '../components/BriefingArticle';
import { PaywallScreen } from './PaywallScreen';
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
  const { isFullAccess } = useSubscriptionStore();
  const [paywallVisible, setPaywallVisible] = useState(false);

  const fullAccess = isFullAccess();
  const activeLang = settings.languages.find((l) => l.code === settings.displayLanguage);
  const language = settings.displayLanguage;
  const level = activeLang?.level ?? 'B1';

  const triggerLoad = useCallback(
    (force = false) => {
      loadWeather(language);
      loadBriefing(language, level, settings.briefingLength, settings.topics, force, !fullAccess);
    },
    [language, level, settings.briefingLength, settings.topics, fullAccess]
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
          {(activeLang?.nativeName ?? 'English').toUpperCase()} EDITION · {level}
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
          {/* Full articles (always visible) */}
          {briefing.articles.map((article, index) => (
            <BriefingArticle
              key={`${article.section}-${index}`}
              article={article}
              isLast={index === briefing.articles.length - 1 && !briefing.teasers?.length}
              language={language}
              level={level}
              locked={!fullAccess}
              onLockedWordPress={() => setPaywallVisible(true)}
            />
          ))}

          {/* Free-tier teasers */}
          {briefing.teasers && briefing.teasers.length > 0 && (
            <>
              {/* Upgrade banner between featured and teasers */}
              <TouchableOpacity
                style={[styles.upgradeBanner, { backgroundColor: colors.accentGold + '18', borderColor: colors.accentGold }]}
                onPress={() => setPaywallVisible(true)}
              >
                <Ionicons name="lock-open-outline" size={18} color={colors.accentGold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.upgradeBannerTitle, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
                    Unlock the full briefing
                  </Text>
                  <Text style={[styles.upgradeBannerSub, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                    Full articles, word tap, 5 languages · £3.50/month
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accentGold} />
              </TouchableOpacity>

              {/* Teaser headlines */}
              {briefing.teasers.map((teaser, i) => (
                <TouchableOpacity
                  key={`teaser-${i}`}
                  style={[styles.teaserRow, { borderBottomColor: colors.borderLight }]}
                  onPress={() => setPaywallVisible(true)}
                >
                  <Text style={[styles.teaserSection, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                    {teaser.section.toUpperCase()}
                  </Text>
                  <Text style={[styles.teaserHeadline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.subheading }]}>
                    {teaser.headline}
                  </Text>
                  <Text style={[styles.teaserBody, { color: colors.inkLight, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                    {teaser.teaser}
                  </Text>
                  <View style={styles.teaserLockRow}>
                    <Ionicons name="lock-closed" size={12} color={colors.inkFaint} />
                    <Text style={[styles.teaserLockText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      Read in full with Bilinguist Brief+
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
            <Text style={[styles.footerText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              {fullAccess ? 'Pull down to refresh · Generated by Claude with live web search' : 'Free edition · Upgrade for the full briefing'}
            </Text>
          </View>
        </>
      )}

      {/* Paywall modal */}
      <Modal visible={paywallVisible} animationType="slide" presentationStyle="pageSheet">
        <PaywallScreen onClose={() => setPaywallVisible(false)} />
      </Modal>
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
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    padding: Spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  upgradeBannerTitle: { fontSize: 14 },
  upgradeBannerSub: { fontSize: 12, marginTop: 2 },
  teaserRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  teaserSection: { fontSize: 11, letterSpacing: 1.5 },
  teaserHeadline: { lineHeight: 28 },
  teaserBody: { lineHeight: 22 },
  teaserLockRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  teaserLockText: { fontSize: 11 },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  footerText: { fontSize: 12 },
});
