import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BriefingArticle } from './BriefingArticle';
import { BriefingLoading } from './BriefingLoading';
import { Spacing } from '../theme';
import type { GeneratedBriefing } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

interface Props {
  langCode: LanguageCode;
  nativeName: string;
  level: LanguageLevel;
  briefing: GeneratedBriefing | undefined;
  isGenerating: boolean;
  error: string | undefined;
  isFirst: boolean;
  fullAccess: boolean;
  onGenerate: () => void;
  onRetry: () => void;
  onLockedWordPress: () => void;
  onUpgradePress: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LanguageBriefingSection({
  langCode,
  nativeName,
  level,
  briefing,
  isGenerating,
  error,
  isFirst,
  fullAccess,
  onGenerate,
  onRetry,
  onLockedWordPress,
  onUpgradePress,
}: Props) {
  const { colors, fontFamily, fontSize } = useTheme();

  return (
    <View>
      {!isFirst && <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />}

      {/* Edition header — newspaper style */}
      <View style={[styles.editionRow, { borderTopColor: colors.inkDark, borderBottomColor: colors.inkDark }]}>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.editionText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {nativeName.toUpperCase()} · {level}
        </Text>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
      </View>
      <View style={[styles.mastRule, { backgroundColor: colors.inkDark }]} />

      {isGenerating && !briefing && <BriefingLoading />}

      {!isGenerating && error && (
        <View style={styles.centerBlock}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.inkFaint} />
          <Text style={[styles.errorText, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            {error}
          </Text>
          <TouchableOpacity style={[styles.button, { borderColor: colors.borderMid }]} onPress={onRetry}>
            <Text style={[styles.buttonText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isGenerating && !error && !briefing && (
        <View style={styles.centerBlock}>
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.inkDark }]}
            onPress={onGenerate}
          >
            <Text style={[styles.generateButtonText, { fontFamily: fontFamily.regular }]}>
              Generate {nativeName} Briefing
            </Text>
          </TouchableOpacity>
          <Text style={[styles.generateNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Takes 20–40 seconds · Cached for the day
          </Text>
        </View>
      )}

      {briefing && (
        <>
          {briefing.articles.map((article, index) => (
            <BriefingArticle
              key={`${article.genre}-${index}`}
              article={article}
              isLast={index === briefing.articles.length - 1 && !briefing.teasers?.length}
              language={langCode}
              level={level}
              locked={!fullAccess}
              onLockedWordPress={onLockedWordPress}
            />
          ))}

          {briefing.teasers && briefing.teasers.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.upgradeBanner, { backgroundColor: colors.accentGold + '18', borderColor: colors.accentGold }]}
                onPress={onUpgradePress}
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

              {briefing.teasers.map((teaser, i) => (
                <TouchableOpacity
                  key={`teaser-${i}`}
                  style={[styles.teaserRow, { borderBottomColor: colors.borderLight }]}
                  onPress={onUpgradePress}
                >
                  <Text style={[styles.teaserSection, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                    {teaser.genre.toUpperCase()}
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

          <View style={[styles.sectionFooter, { borderTopColor: colors.borderLight }]}>
            <Text style={[styles.footerText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              {briefing.generatedAt
                ? `Generated today at ${formatTime(briefing.generatedAt)} · Claude with live web search`
                : 'Generated by Claude with live web search'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: 2,
    marginTop: Spacing.xl,
  },
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
  mastRule: { height: 1, marginHorizontal: Spacing.md, marginBottom: Spacing.xs },
  centerBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  errorText: { textAlign: 'center', lineHeight: 24 },
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
  generateButtonText: { color: '#FFF', fontSize: 16 },
  generateNote: { fontSize: 13 },
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
  sectionFooter: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  footerText: { fontSize: 12 },
});
