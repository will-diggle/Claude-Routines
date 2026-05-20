import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { Spacing } from '../theme';

const PLACEHOLDER_SECTIONS = [
  {
    category: 'World News',
    headline: 'Your daily briefing will appear here',
    body: 'Once configured, Claude will generate a fresh news briefing each morning in your chosen language and at your chosen level. Stories will be sourced from Reuters, AP, BBC, The Guardian, and the Financial Times.',
  },
  {
    category: 'Politics',
    headline: 'Tap any word to look it up instantly',
    body: 'When the briefing is generated, tap any word to get an instant translation via DeepL, a contextual explanation from Claude, and the option to save it to your word bank for practice later.',
  },
  {
    category: 'Science & Technology',
    headline: 'Sections follow your chosen topics',
    body: 'Your briefing is organised into the topic sections you selected in settings. You can adjust which sections appear and how long your briefing is at any time.',
  },
];

export function BriefingScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const { displayLanguage, languages } = useSettingsStore();
  const currentLang = languages.find((l) => l.code === displayLanguage);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Weather strip */}
      <View style={[styles.weatherStrip, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.weatherText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
          Good morning — weather will appear once location is enabled
        </Text>
      </View>

      {/* Edition line */}
      <View style={[styles.editionLine, { borderBottomColor: colors.inkDark }]}>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.editionText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {currentLang ? `${currentLang.name.toUpperCase()} EDITION` : 'EDITION'} · {currentLang?.level ?? '—'}
        </Text>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
      </View>

      {/* Placeholder articles */}
      {PLACEHOLDER_SECTIONS.map((section, index) => (
        <View key={index} style={[styles.article, index < PLACEHOLDER_SECTIONS.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[styles.category, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
            {section.category.toUpperCase()}
          </Text>
          <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            {section.headline}
          </Text>
          <Text style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            {section.body}
          </Text>
        </View>
      ))}

      <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
        <Text style={[styles.footerText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
          Briefings generate fresh each morning · Powered by Claude
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  weatherStrip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weatherText: {
    fontSize: 13,
    textAlign: 'center',
  },
  editionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    borderBottomWidth: 2,
  },
  editionRule: {
    flex: 1,
    height: 1,
  },
  editionText: {
    fontSize: 11,
    letterSpacing: 1.5,
    paddingHorizontal: Spacing.sm,
  },
  article: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  category: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  headline: {
    lineHeight: 34,
    marginBottom: Spacing.sm,
  },
  body: {
    lineHeight: 26,
    color: '#3D3D3D',
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
  },
});
