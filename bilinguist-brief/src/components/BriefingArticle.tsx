import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import type { BriefingArticle as Article } from '../services/anthropic';

interface Props {
  article: Article;
  isLast: boolean;
}

export function BriefingArticle({ article, isLast }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.section, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
        {article.section.toUpperCase()}
      </Text>

      <Text
        style={[
          styles.headline,
          { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading },
        ]}
      >
        {article.headline}
      </Text>

      {/* Body — Stage 3 will replace this Text with TappableText */}
      <Text
        style={[
          styles.body,
          { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body },
        ]}
      >
        {article.body}
      </Text>

      {!isLast && (
        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  headline: {
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  body: {
    lineHeight: 28,
    marginBottom: Spacing.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
});
