import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useAuthStore } from './useAuthStore';

// Not persisted (unlike useSubscriptionStore/useAuthStore) — friends,
// requests, and streak data are cross-user and accept-gated, so a stale
// AsyncStorage copy could show data for a friend who was since removed, or
// leak a pending requester's info. Always refetched from the server.

export interface Friend {
  userId: string;
  username: string;
  readingStreaks: Record<string, number>;
  activeLanguageCodes: string[];
}

export interface PendingFriend {
  userId: string;
  username: string;
}

export interface UsernameSearchResult {
  userId: string;
  username: string;
}

export type RedeemResult =
  | { ok: true; friendUsername: string }
  | { ok: false; code: string; message: string };

interface FunctionError extends Error {
  code?: string;
  status?: number;
}

// search-username returns nothing for shorter queries (so prefixes can't be
// used to list every user) — skip the round trip. Keep in step with
// MIN_QUERY_LENGTH in supabase/functions/search-username.
export const MIN_USERNAME_QUERY = 3;

function functionsUrl(name: string): string {
  return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
}

// Same raw-fetch-to-functions/v1 pattern as pushRegistration.ts — this app
// never uses supabase.functions.invoke().
async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const session = useAuthStore.getState().session;
  if (!session?.access_token) throw new Error('Not signed in');
  const res = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const responseJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: FunctionError = new Error(responseJson?.error ?? 'Request failed');
    err.code = responseJson?.code;
    err.status = res.status;
    throw err;
  }
  return responseJson as T;
}

interface FriendsStore {
  // Global modal visibility — same pattern as useSubscriptionStore's
  // paywallVisible/showPaywall/hidePaywall, rendered once at the App root so
  // a deep link (friend-invite redemption) can open it from anywhere.
  visible: boolean;
  pendingInviteToken: string | null;
  show: (opts?: { redeemToken?: string }) => void;
  hide: () => void;
  clearPendingInviteToken: () => void;

  friends: Friend[];
  incoming: PendingFriend[];
  outgoing: PendingFriend[];
  loading: boolean;
  error: string | null;
  fetchFriends: () => Promise<void>;

  searchResults: UsernameSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  searchUsernames: (query: string) => Promise<void>;
  clearSearch: () => void;

  sendRequest: (userId: string) => Promise<boolean>;
  acceptRequest: (requesterId: string) => Promise<boolean>;
  declineRequest: (requesterId: string) => Promise<boolean>;
  cancelRequest: (addresseeId: string) => Promise<boolean>;
  removeFriend: (friendId: string) => Promise<boolean>;

  inviteUrl: string | null;
  inviteLoading: boolean;
  inviteError: string | null;
  generateInviteLink: () => Promise<void>;

  redeemLoading: boolean;
  redeemInvite: (token: string) => Promise<RedeemResult>;
}

export const useFriendsStore = create<FriendsStore>()((set, get) => ({
  visible: false,
  pendingInviteToken: null,
  show: (opts) => set({ visible: true, pendingInviteToken: opts?.redeemToken ?? get().pendingInviteToken }),
  hide: () => set({ visible: false }),
  clearPendingInviteToken: () => set({ pendingInviteToken: null }),

  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  error: null,
  fetchFriends: async () => {
    set({ loading: true, error: null });
    try {
      const data = await callFunction<{
        friends: Array<{ user_id: string; username: string; reading_streaks: Record<string, number>; active_language_codes: string[] }>;
        incoming: Array<{ user_id: string; username: string }>;
        outgoing: Array<{ user_id: string; username: string }>;
      }>('list-friends', {});
      set({
        friends: data.friends.map((f) => ({
          userId: f.user_id,
          username: f.username,
          readingStreaks: f.reading_streaks,
          activeLanguageCodes: f.active_language_codes,
        })),
        incoming: data.incoming.map((r) => ({ userId: r.user_id, username: r.username })),
        outgoing: data.outgoing.map((r) => ({ userId: r.user_id, username: r.username })),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: (e as Error)?.message ?? 'Failed to load friends' });
    }
  },

  searchResults: [],
  searchLoading: false,
  searchError: null,
  searchUsernames: async (query) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_USERNAME_QUERY) {
      set({ searchResults: [], searchLoading: false, searchError: null });
      return;
    }
    set({ searchLoading: true, searchError: null });
    try {
      const data = await callFunction<{ results: Array<{ user_id: string; username: string }> }>('search-username', { query: trimmed });
      set({ searchResults: data.results.map((r) => ({ userId: r.user_id, username: r.username })), searchLoading: false });
    } catch (e) {
      set({ searchLoading: false, searchError: (e as Error)?.message ?? 'Search failed' });
    }
  },
  clearSearch: () => set({ searchResults: [], searchError: null }),

  // These three, plus remove/decline/cancel below, are direct RLS-scoped
  // client calls per 007_friends.sql's own design note — friendships INSERT
  // (own pending request), UPDATE (accept), and DELETE (decline/cancel/
  // unfriend) are all covered by client-safe policies, so none of this
  // needs an Edge Function.
  sendRequest: async (userId) => {
    if (!supabase) return false;
    const session = useAuthStore.getState().session;
    if (!session?.user?.id) return false;
    const { error } = await supabase.from('friendships').insert({
      requester_id: session.user.id,
      addressee_id: userId,
      status: 'pending',
    });
    if (error) return false;
    await get().fetchFriends();
    return true;
  },

  acceptRequest: async (requesterId) => {
    if (!supabase) return false;
    const session = useAuthStore.getState().session;
    if (!session?.user?.id) return false;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('requester_id', requesterId)
      .eq('addressee_id', session.user.id)
      .eq('status', 'pending');
    if (error) return false;
    await get().fetchFriends();
    return true;
  },

  declineRequest: async (requesterId) => {
    if (!supabase) return false;
    const session = useAuthStore.getState().session;
    if (!session?.user?.id) return false;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('requester_id', requesterId)
      .eq('addressee_id', session.user.id);
    if (error) return false;
    await get().fetchFriends();
    return true;
  },

  cancelRequest: async (addresseeId) => {
    if (!supabase) return false;
    const session = useAuthStore.getState().session;
    if (!session?.user?.id) return false;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('requester_id', session.user.id)
      .eq('addressee_id', addresseeId);
    if (error) return false;
    await get().fetchFriends();
    return true;
  },

  removeFriend: async (friendId) => {
    if (!supabase) return false;
    const session = useAuthStore.getState().session;
    if (!session?.user?.id) return false;
    const me = session.user.id;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${me})`);
    if (error) return false;
    await get().fetchFriends();
    return true;
  },

  inviteUrl: null,
  inviteLoading: false,
  inviteError: null,
  generateInviteLink: async () => {
    set({ inviteLoading: true, inviteError: null });
    try {
      const data = await callFunction<{ token: string; url: string }>('create-friend-invite', {});
      set({ inviteUrl: data.url, inviteLoading: false });
    } catch (e) {
      set({ inviteLoading: false, inviteError: (e as Error)?.message ?? 'Failed to create invite link' });
    }
  },

  redeemLoading: false,
  redeemInvite: async (token) => {
    set({ redeemLoading: true });
    try {
      const data = await callFunction<{ ok: true; friend: { user_id: string; username: string } }>('redeem-friend-invite', { token });
      set({ redeemLoading: false, pendingInviteToken: null });
      await get().fetchFriends();
      return { ok: true, friendUsername: data.friend.username };
    } catch (e) {
      const err = e as FunctionError;
      set({ redeemLoading: false, pendingInviteToken: null });
      return { ok: false, code: err.code ?? 'unknown', message: err.message ?? 'Failed to redeem invite' };
    }
  },
}));
