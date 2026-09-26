import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useFriendsStore, MIN_USERNAME_QUERY } from '../store/useFriendsStore';
import { Spacing } from '../theme';

// Rendered as one of FriendsScreen's internal views (not its own <Modal>) —
// see FriendsScreen.tsx for why: this codebase has a documented issue with
// two <Modal>s changing visible in the same tick, so the whole Friends
// feature lives inside a single Modal shell that swaps content instead.
// Back navigation to the hub is handled by that shell's own header.

const SEARCH_DEBOUNCE_MS = 400;

export function FriendSearchScreen() {
  const { colors, fontFamily, isDark } = useTheme();
  const [queryInput, setQueryInput] = useState('');
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  const searchResults = useFriendsStore((s) => s.searchResults);
  const searchLoading = useFriendsStore((s) => s.searchLoading);
  const searchError = useFriendsStore((s) => s.searchError);
  const searchUsernames = useFriendsStore((s) => s.searchUsernames);
  const clearSearch = useFriendsStore((s) => s.clearSearch);
  const sendRequest = useFriendsStore((s) => s.sendRequest);
  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { searchUsernames(queryInput); }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [queryInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearSearch(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function statusFor(userId: string): 'friend' | 'outgoing' | 'incoming' | 'sent' | null {
    if (friends.some((f) => f.userId === userId)) return 'friend';
    if (outgoing.some((r) => r.userId === userId)) return 'outgoing';
    if (incoming.some((r) => r.userId === userId)) return 'incoming';
    if (sentTo.has(userId)) return 'sent';
    return null;
  }

  async function handleAdd(userId: string) {
    setSendingId(userId);
    const ok = await sendRequest(userId);
    setSendingId(null);
    if (ok) setSentTo((prev) => new Set(prev).add(userId));
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.fieldWrap, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={17} color={colors.inkFaint} style={{ marginRight: Spacing.xs }} />
        <TextInput
          style={{ flex: 1, color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: 15, paddingVertical: 12 }}
          value={queryInput}
          onChangeText={setQueryInput}
          placeholder="Search by username"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {searchLoading && <ActivityIndicator color={colors.inkFaint} />}
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Spacing.xl }}>
        {searchError ? (
          <Text style={[styles.helper, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>{searchError}</Text>
        ) : null}

        {queryInput.trim().length > 0 && queryInput.trim().length < MIN_USERNAME_QUERY ? (
          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Type at least {MIN_USERNAME_QUERY} characters.</Text>
        ) : null}

        {!searchLoading && queryInput.trim().length >= MIN_USERNAME_QUERY && searchResults.length === 0 && !searchError ? (
          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>No one found with that username.</Text>
        ) : null}

        {searchResults.map((result) => {
          const status = statusFor(result.userId);
          const isSending = sendingId === result.userId;
          return (
            <View key={result.userId} style={[styles.row, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                @{result.username}
              </Text>
              {status === 'friend' ? (
                <Text style={[styles.statusText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Friends</Text>
              ) : status === 'outgoing' || status === 'sent' ? (
                <Text style={[styles.statusText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Requested</Text>
              ) : status === 'incoming' ? (
                <Text style={[styles.statusText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Wants to add you</Text>
              ) : (
                <TouchableOpacity
                  style={[styles.addPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.inkDark, opacity: isSending ? 0.6 : 1 }]}
                  onPress={() => handleAdd(result.userId)}
                  disabled={isSending}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={[styles.addPillText, { color: colors.bg, fontFamily: fontFamily.bold }]}>Add</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  helper: {
    fontSize: 13,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  username: { flex: 1, fontSize: 15 },
  statusText: { fontSize: 13 },
  addPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: 100,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPillText: { fontSize: 13 },
});
