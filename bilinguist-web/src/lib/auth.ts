import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

// Same Supabase project as the iPhone app, so one account works in both.
// These are the public URL + anon key (already shipped inside the app
// bundle) and are injected at build time from Cloudflare build variables.
const url = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const AUTH_CONFIGURED = supabase !== null;

export type Tier = 'free' | 'premium';

export type OAuthProvider = 'apple' | 'google';

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Mirrors how revenuecat-webhook writes user_subscriptions: tier 'premium'
// covers active/trial/cancelled-until-expiry/paused; expiry flips tier to 'free'.
// No row, or a read the table's RLS refuses, means free.
export async function getTier(userId: string): Promise<Tier> {
  if (!supabase) return 'free';
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('tier, status, subscription_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data || data.tier !== 'premium' || data.status === 'expired') return 'free';
  if (data.subscription_expires_at && new Date(data.subscription_expires_at) < new Date()) return 'free';
  return 'premium';
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
  return data.session;
}

export async function signInWithProvider(provider: OAuthProvider) {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login?reset=1`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut().catch(() => {});
  window.location.replace('/login');
}

// Before first paint: if there's no stored Supabase session at all, go
// straight to /login rather than flashing the brief. The real session
// check (expiry, refresh) happens afterwards in requireSession().
export const AUTH_GATE_SCRIPT = `
(function () {
  if (!${JSON.stringify(Boolean(url && anonKey))}) return;
  if (/[#&]access_token=/.test(location.hash) || /[?&]code=/.test(location.search)) return;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return;
    }
  } catch (e) {}
  location.replace('/login');
})();
`;

export interface Account {
  session: Session | null;
  tier: Tier;
}

// Resolves the signed-in account, redirecting to /login if there isn't one.
// Unconfigured builds skip the gate so the site stays reachable.
export async function requireSession(): Promise<Account> {
  if (!supabase) return { session: null, tier: 'free' };
  const session = await getSession();
  if (!session) {
    window.location.replace('/login');
    return new Promise(() => {});
  }
  return { session, tier: await getTier(session.user.id) };
}
