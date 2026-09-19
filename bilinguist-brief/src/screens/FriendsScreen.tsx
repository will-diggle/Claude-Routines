import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/useAuthStore';
import { useFriendsStore } from '../store/useFriendsStore';
import { supabase } from '../services/supabase';
import { SignInRequiredScreen } from './SignInRequiredScreen';
import { FriendSearchScreen } from './FriendSearchScreen';
import { FriendInviteScreen } from './FriendInviteScreen';
import { FlagCircle } from '../components/FlagCircle';
import { Spacing } from '../theme';

// Mirrors the DB's user_profiles_username_format CHECK constraint exactly
// (see 007_friends.sql) — this is a client-side pre-check for a fast error,
// not the real enforcement.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

type HubView = 'hub' | 'search' | 'invite';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Rendered once at the App root (see App.tsx) exactly like PaywallScreen —
// `visible`/`onClose` are backed by useFriendsStore's visible/show/hide
// there, not local component state, so a deep link
// (useFriendInviteDeepLink.ts) can open straight to this screen from
// anywhere, not just from the Settings row that also opens it.
//
// Search and the invite share sheet are rendered as internal views of this
// one Modal rather than Modals of their own — SettingsScreen.tsx documents
// a real bug where two <Modal>s toggling `visible` in the same tick can wedge
// iOS's modal presentation, so the whole feature stays inside a single shell.
export function FriendsScreen({ visible, onClose }: Props) {
  const { colors, fontFamily, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const pendingInviteToken = useFriendsStore((s) => s.pendingInviteToken);
  const redeemInvite = useFriendsStore((s) => s.redeemInvite);

  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const loading = useFriendsStore((s) => s.loading);
  const error = useFriendsStore((s) => s.error);
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);
  const acceptRequest = useFriendsStore((s) => s.acceptRequest);
  const declineRequest = useFriendsStore((s) => s.declineRequest);
  const cancelRequest = useFriendsStore((s) => s.cancelRequest);
  const removeFriend = useFriendsStore((s) => s.removeFriend);

  const session = useAuthStore((s) => s.session);

  const [view, setView] = useState<HubView>('hub');
  // undefined = still loading the caller's own row; null = no username claimed yet.
  const [friendUsername, setFriendUsername] = useState<string | null | undefined>(undefined);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const redeemedTokenRef = useRef<string | null>(null);

  useEffect(() => { if (visible) setView('hub'); }, [visible]);

  useEffect(() => {
    if (!visible || !session?.user?.id) return;
    fetchFriends();
  }, [visible, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Own username row — a direct client read (user_profiles_select_own RLS
  // policy already allows this), not one of the cross-user Edge Functions.
  useEffect(() => {
    if (!supabase || !visible || !session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!cancelled) setFriendUsername(data?.username ?? null);
    })();
    return () => { cancelled = true; };
  }, [visible, session?.user?.id]);

  // Auto-redeems an invite token handed in via deep link (or a search-sheet
  // add-by-link in future) as soon as a session exists. Guarded by a ref so
  // StrictMode/re-renders never redeem the same token twice.
  useEffect(() => {
    if (!visible || !session?.user?.id || !pendingInviteToken) return;
    if (redeemedTokenRef.current === pendingInviteToken) return;
    redeemedTokenRef.current = pendingInviteToken;
    (async () => {
      const result = await redeemInvite(pendingInviteToken);
      if (result.ok) {
        Alert.alert('Friend added', `You're now friends with @${result.friendUsername}.`);
      } else {
        Alert.alert("Couldn't add friend", result.message);
      }
    })();
  }, [visible, session?.user?.id, pendingInviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSignInClose() {
    // A successful sign-in already flips `session` (via App.tsx's
    // onAuthStateChange), which re-renders this component past the
    // !session branch below on its own — only an explicit cancel (still
    // signed out when this fires) should dismiss the whole screen.
    if (!useAuthStore.getState().session) onClose();
  }

  // `session` flipping true swaps which of the two Modal-owning branches
  // below renders — SignInRequiredScreen's own <Modal> unmounting the exact
  // commit the hub's own <Modal> mounts. SettingsScreen.tsx documents that
  // two <Modal>s changing presentation state in the same tick can wedge
  // iOS's modal presentation; this closes the sign-in sheet first and only
  // swaps to the hub after it's actually gone, matching closeSheetThen there.
  const [postSignInDelay, setPostSignInDelay] = useState(false);
  const hadSessionRef = useRef(!!session);
  useEffect(() => {
    const justSignedIn = !hadSessionRef.current && !!session;
    hadSessionRef.current = !!session;
    if (!justSignedIn) return;
    setPostSignInDelay(true);
    const t = setTimeout(() => setPostSignInDelay(false), 350);
    return () => clearTimeout(t);
  }, [session]);

  async function handleClaimUsername() {
    const trimmed = usernameInput.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setUsernameError('3-20 letters, numbers, or underscores.');
      return;
    }
    if (!session?.access_token) return;
    setUsernameSubmitting(true);
    setUsernameError(null);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${supabaseUrl}/functions/v1/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ username: trimmed }),
      });
      const responseJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsernameError(responseJson?.code === 'username_taken' ? 'That username is taken.' : (responseJson?.error ?? 'Something went wrong.'));
        return;
      }
      setFriendUsername(trimmed);
    } catch {
      setUsernameError('Something went wrong. Please try again.');
    } finally {
      setUsernameSubmitting(false);
    }
  }

  async function handleAccept(id: string) { setActioningId(id); await acceptRequest(id); setActioningId(null); }
  async function handleDecline(id: string) { setActioningId(id); await declineRequest(id); setActioningId(null); }
  async function handleCancel(id: string) { setActioningId(id); await cancelRequest(id); setActioningId(null); }

  function handleRemove(id: string, username: string) {
    Alert.alert('Remove friend?', `You and @${username} will no longer see each other's streaks.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => { setActioningId(id); await removeFriend(id); setActioningId(null); },
      },
    ]);
  }

  if (!session || postSignInDelay) {
    return <SignInRequiredScreen visible={visible && !postSignInDelay} onClose={handleSignInClose} />;
  }

  const backAction = () => (view === 'hub' ? onClose() : setView('hub'));
  const title = view === 'hub' ? 'Friends' : view === 'search' ? 'Find friends' : 'Invite a friend';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={backAction}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity onPress={backAction} style={styles.backCircle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <BlurView intensity={isDark ? 60 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <Ionicons name={view === 'hub' ? 'close' : 'chevron-back'} size={20} color={colors.inkDark} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {view === 'search' && <FriendSearchScreen />}
        {view === 'invite' && <FriendInviteScreen />}

        {view === 'hub' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }} keyboardShouldPersistTaps="handled">
            {friendUsername === undefined ? (
              <ActivityIndicator color={colors.inkFaint} style={{ marginTop: Spacing.xl }} />
            ) : friendUsername === null ? (
              <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.card, marginTop: Spacing.md }]}>
                <Text style={[styles.cardTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>Claim your username</Text>
                <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Friends find you by searching for this — it's separate from your display name.
                </Text>
                <TextInput
                  style={[styles.usernameInput, { borderColor: colors.borderLight, color: colors.inkDark, fontFamily: fontFamily.regular }]}
                  value={usernameInput}
                  onChangeText={(t) => { setUsernameInput(t); setUsernameError(null); }}
                  placeholder="username"
                  placeholderTextColor={colors.inkFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
                {usernameError ? (
                  <Text style={[styles.errorText, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>{usernameError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.claimButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.inkDark, opacity: usernameSubmitting ? 0.6 : 1 }]}
                  onPress={handleClaimUsername}
                  disabled={usernameSubmitting}
                >
                  {usernameSubmitting ? <ActivityIndicator color={colors.bg} /> : (
                    <Text style={[styles.claimButtonText, { color: colors.bg, fontFamily: fontFamily.bold }]}>Save username</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {error ? (
                  <Text style={[styles.helper, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>{error}</Text>
                ) : null}

                {incoming.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>REQUESTS</Text>
                    <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                      {incoming.map((r, i) => (
                        <View key={r.userId} style={[styles.rowItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]}>
                          <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                            @{r.username}
                          </Text>
                          <View style={styles.actionsRow}>
                            <TouchableOpacity onPress={() => handleAccept(r.userId)} disabled={actioningId === r.userId} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="checkmark-circle" size={24} color={colors.inkDark} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDecline(r.userId)} disabled={actioningId === r.userId} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close-circle-outline" size={24} color={colors.inkFaint} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {outgoing.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>SENT</Text>
                    <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                      {outgoing.map((r, i) => (
                        <View key={r.userId} style={[styles.rowItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]}>
                          <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                            @{r.username}
                          </Text>
                          <TouchableOpacity onPress={() => handleCancel(r.userId)} disabled={actioningId === r.userId}>
                            <Text style={[styles.cancelText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>FRIENDS</Text>
                <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                  {loading && friends.length === 0 ? (
                    <ActivityIndicator color={colors.inkFaint} style={{ paddingVertical: Spacing.lg }} />
                  ) : friends.length === 0 ? (
                    <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginHorizontal: Spacing.md, marginVertical: Spacing.md }]}>
                      No friends yet — search by username or share your invite link below.
                    </Text>
                  ) : (
                    friends.map((f, i) => (
                      <View key={f.userId} style={[styles.rowItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                            @{f.username}
                          </Text>
                          <View style={styles.flagRow}>
                            {f.activeLanguageCodes.length === 0 ? (
                              <Text style={[styles.mutedText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>No active languages</Text>
                            ) : (
                              f.activeLanguageCodes.map((code) => (
                                <View key={code} style={styles.flagChip}>
                                  <FlagCircle code={code} size={16} />
                                  <Text style={[styles.flagChipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                                    {f.readingStreaks[code] ?? 0}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => handleRemove(f.userId, f.username)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="person-remove-outline" size={18} color={colors.inkFaint} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>

                <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                  <TouchableOpacity style={styles.rowItem} onPress={() => setView('search')}>
                    <Ionicons name="search-outline" size={18} color={colors.inkDark} style={{ marginRight: Spacing.sm }} />
                    <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Find friends by username</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.rowItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]} onPress={() => setView('invite')}>
                    <Ionicons name="link-outline" size={18} color={colors.inkDark} style={{ marginRight: Spacing.sm }} />
                    <Text style={[styles.username, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Share invite link</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: { fontSize: 18 },
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardTitle: { fontSize: 17, padding: Spacing.md, paddingBottom: 0 },
  helper: { fontSize: 13, marginHorizontal: Spacing.lg, marginTop: Spacing.xs, marginBottom: Spacing.sm, lineHeight: 19 },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.2,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: Spacing.sm,
  },
  username: { flex: 1, fontSize: 15 },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm },
  cancelText: { fontSize: 13 },
  mutedText: { fontSize: 12 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
  flagChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagChipText: { fontSize: 12 },
  usernameInput: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorText: { fontSize: 12, marginHorizontal: Spacing.md, marginTop: Spacing.xs },
  claimButton: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: 100,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonText: { fontSize: 15 },
});
