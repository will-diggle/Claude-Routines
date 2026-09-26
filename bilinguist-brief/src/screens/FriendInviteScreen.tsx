import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useFriendsStore } from '../store/useFriendsStore';
import { GlassSurface } from '../components/GlassSurface';
import { Spacing } from '../theme';

// Rendered as one of FriendsScreen's internal views — see FriendsScreen.tsx
// for why this isn't its own <Modal>.

export function FriendInviteScreen() {
  const { colors, fontFamily, isDark } = useTheme();
  const inviteUrl = useFriendsStore((s) => s.inviteUrl);
  const inviteLoading = useFriendsStore((s) => s.inviteLoading);
  const inviteError = useFriendsStore((s) => s.inviteError);
  const generateInviteLink = useFriendsStore((s) => s.generateInviteLink);

  useEffect(() => {
    if (!inviteUrl) generateInviteLink();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleShare() {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `Add me as a friend on Bilinguist Brief: ${inviteUrl}`,
        url: inviteUrl,
      });
    } catch {}
  }

  return (
    <View style={styles.container}>
      <Ionicons name="link" size={30} color={colors.inkFaint} style={{ marginBottom: Spacing.md }} />
      <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>Invite a friend</Text>
      <Text style={[styles.subtitle, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
        Share this link with one friend — opening it on their device adds you as friends right away. It works once, within 7 days.
      </Text>

      {inviteLoading ? (
        <ActivityIndicator color={colors.inkFaint} style={{ marginTop: Spacing.lg }} />
      ) : inviteError ? (
        <Text style={[styles.errorText, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>{inviteError}</Text>
      ) : inviteUrl ? (
        <>
          <View style={[styles.linkBox, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
            <Text style={[styles.linkText, { color: colors.inkMid, fontFamily: fontFamily.regular }]} numberOfLines={1}>
              {inviteUrl}
            </Text>
          </View>

          <View style={styles.pillShadow}>
            <TouchableOpacity
              style={[styles.pillButton, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}
              onPress={handleShare}
            >
              <GlassSurface cornerRadius={100} colorScheme={isDark ? 'dark' : 'light'} intensity={80} />
              <Ionicons name="share-outline" size={17} color={colors.inkDark} style={{ marginRight: 8 }} />
              <Text style={[styles.pillText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>Share link</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  title: { fontSize: 20, marginBottom: Spacing.xs, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: Spacing.lg },
  errorText: { fontSize: 14, textAlign: 'center', marginTop: Spacing.md },
  linkBox: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  linkText: { fontSize: 13 },
  pillShadow: {
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
    alignSelf: 'stretch',
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 100,
    overflow: 'hidden',
  },
  pillText: { fontSize: 15 },
});
