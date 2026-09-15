import { useEffect } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../services/supabase';
import * as analytics from '../services/analytics';

const AUTH_REDIRECT_PREFIX = 'bilinguistbrief://auth';

// The Supabase client here doesn't set flowType, so it defaults to the
// implicit flow: a successful redirect carries access_token/refresh_token
// in the URL fragment (or query, since some webviews drop the fragment on
// redirect) rather than a PKCE `code`.
function extractTokens(url: string): { access_token: string; refresh_token: string } | null {
  const paramString = url.split('#')[1] ?? url.split('?')[1];
  if (!paramString) return null;
  const params = new URLSearchParams(paramString);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

async function handleAuthUrl(url: string) {
  if (!supabase || !url.startsWith(AUTH_REDIRECT_PREFIX)) return;
  const tokens = extractTokens(url);
  if (!tokens) return;
  const { error } = await supabase.auth.setSession(tokens);
  if (error) {
    console.warn('[useAuthDeepLink] failed to establish session:', error.message);
    return;
  }
  // App.tsx's onAuthStateChange picks up the resulting SIGNED_IN event and
  // updates the auth store / identifies the user / syncs streaks — this just
  // records the login the same way the other sign-in methods do.
  analytics.trackUserLoggedIn();
}

// Catches the OAuth redirect back into the app at bilinguistbrief://auth
// (both while the app is running and on cold start) and turns it into a
// Supabase session.
export function useAuthDeepLink() {
  useEffect(() => {
    if (!supabase) return;
    Linking.getInitialURL().then((url) => { if (url) handleAuthUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { handleAuthUrl(url); });
    return () => sub.remove();
  }, []);
}
