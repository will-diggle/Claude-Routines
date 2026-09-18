import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import * as analytics from '../services/analytics';

interface UseAuthFlowsOptions {
  // Called once the UI hosting this hook should dismiss itself — right after
  // a session is set (Apple/email) or right after the OAuth browser opens
  // (Google, which completes asynchronously via deep link).
  onDone?: () => void;
}

export function useAuthFlows({ onDone }: UseAuthFlowsOptions = {}) {
  const setSession = useAuthStore((s) => s.setSession);

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAppleSignIn = useCallback(async () => {
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      if (data.session) {
        setSession(data.session);
        analytics.trackUserLoggedIn();
      }
      onDone?.();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setAuthError(e?.message ?? 'Apple sign-in failed');
      }
    } finally {
      setAuthLoading(false);
    }
  }, [onDone, setSession]);

  const handleGoogleSignIn = useCallback(async () => {
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'bilinguistbrief://auth',
        },
      });
      if (data?.url) Linking.openURL(data.url);
      onDone?.();
    } catch (e: any) {
      setAuthError(e?.message ?? 'Google sign-in failed');
    } finally {
      setAuthLoading(false);
    }
  }, [onDone]);

  const handleEmailAuth = useCallback(async () => {
    if (!authEmail.trim() || !authPassword) return;
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          analytics.trackUserLoggedIn();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          analytics.trackUserSignedUp();
        } else {
          Alert.alert('Check your email', 'We sent you a confirmation link — click it to activate your account.');
        }
      }
      onDone?.();
      setAuthEmail('');
      setAuthPassword('');
    } catch (e: any) {
      setAuthError(e?.message ?? 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, authMode, onDone, setSession]);

  const handleForgotPassword = useCallback(async () => {
    if (!authEmail.trim()) {
      setAuthError('Enter your email above first, then tap "Forgot password?"');
      return;
    }
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: 'bilinguistbrief://auth',
      });
      if (error) throw error;
      Alert.alert('Check your email', `If an account exists for ${authEmail.trim()}, we sent a link to reset your password.`);
    } catch (e: any) {
      setAuthError(e?.message ?? 'Could not send reset email');
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail]);

  return {
    authMode, setAuthMode,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authLoading,
    authError, setAuthError,
    handleAppleSignIn,
    handleGoogleSignIn,
    handleEmailAuth,
    handleForgotPassword,
  };
}
