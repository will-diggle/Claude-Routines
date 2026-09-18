import React, { useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '../hooks/useTheme';
import { useAuthFlows } from '../hooks/useAuthFlows';
import { GlassSurface } from '../components/GlassSurface';
import { Spacing } from '../theme';

// The app's actual home-screen icon tile (solid background + "B" monogram),
// not the ornate crest — reads better small and matches what the user
// already recognises from their home screen.
const APP_ICONS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/icon-cream.png'),
  softGrey: require('../../assets/icon-navy.png'),
  white:    require('../../assets/icon-white.png'),
  night:    require('../../assets/icon-black.png'),
};

export function SignInRequiredScreen() {
  const { colors, fontFamily, background, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [appleAvailable, setAppleAvailable] = React.useState(false);

  const {
    authMode, setAuthMode,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authLoading,
    authError,
    handleAppleSignIn,
    handleGoogleSignIn,
    handleEmailAuth,
    handleForgotPassword,
  } = useAuthFlows();

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // Note: triggering the trial-aware paywall on successful sign-in is NOT
  // done here — App.tsx unmounts this screen in the same render pass where
  // `session` first becomes truthy (the gate condition flips immediately),
  // so an effect here would never see the transition. App.tsx owns that.

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Image
            source={APP_ICONS[background] ?? APP_ICONS.cream}
            style={styles.icon}
            resizeMode="cover"
          />
        </View>

        <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          Sign in to continue
        </Text>
        <Text style={[styles.subtitle, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          Create a free account to keep reading — plus get 3 days of Premium on us.
        </Text>

        {appleAvailable && (
          <View style={styles.socialRow}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={22}
              style={{ height: 44 }}
              onPress={handleAppleSignIn}
            />
          </View>
        )}

        <View style={styles.glassPillShadow}>
          <TouchableOpacity
            style={[styles.glassPillButton, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}
            onPress={handleGoogleSignIn}
            disabled={authLoading}
          >
            <GlassSurface cornerRadius={100} colorScheme={isDark ? 'dark' : 'light'} intensity={80} />
            <Ionicons name="logo-google" size={18} color={colors.inkDark} style={{ marginRight: 8 }} />
            <Text style={[styles.googleButtonText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
              Continue with Google
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderMid }]} />
          <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 12, marginHorizontal: 10 }}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderMid }]} />
        </View>

        <View style={[styles.fieldsOuter, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
          <View style={styles.fieldRow}>
            <TextInput
              style={{ flex: 1, color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: 15 }}
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="Email"
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
          <View style={[styles.fieldRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }]}>
            <TextInput
              style={{ flex: 1, color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: 15 }}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="Password"
              placeholderTextColor={colors.inkFaint}
              secureTextEntry
              autoComplete={authMode === 'signup' ? 'new-password' : 'password'}
              onSubmitEditing={handleEmailAuth}
            />
          </View>
        </View>

        {authMode === 'signin' && (
          <TouchableOpacity onPress={handleForgotPassword} disabled={authLoading} style={styles.forgotButton}>
            <Text style={{ color: colors.inkLight, fontFamily: fontFamily.regular, fontSize: 13 }}>
              Forgot password?
            </Text>
          </TouchableOpacity>
        )}

        {authError ? (
          <Text style={[styles.errorText, { fontFamily: fontFamily.regular }]}>{authError}</Text>
        ) : null}

        <View style={[styles.glassPillShadow, { opacity: authLoading ? 0.6 : 1, marginTop: Spacing.md }]}>
          <TouchableOpacity
            style={[styles.glassPillButton, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}
            onPress={handleEmailAuth}
            disabled={authLoading}
          >
            <GlassSurface cornerRadius={100} colorScheme={isDark ? 'dark' : 'light'} intensity={80} />
            <Text style={[styles.glassPillText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {authLoading ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.toggleModeButton}
          onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
        >
          <Text style={{ color: colors.inkLight, fontFamily: fontFamily.regular, fontSize: 14 }}>
            {authMode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    alignItems: 'stretch',
  },
  iconWrap: {
    alignSelf: 'center',
    marginBottom: Spacing.md,
    borderRadius: 18,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  socialRow: {
    marginBottom: Spacing.sm,
  },
  glassPillShadow: {
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: Spacing.sm,
  },
  glassPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 100,
    overflow: 'hidden',
  },
  googleButtonText: {
    fontSize: 15,
  },
  glassPillText: {
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  fieldsOuter: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  fieldRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.xs,
  },
  errorText: {
    color: '#E53935',
    fontSize: 13,
    marginTop: Spacing.sm,
  },
  toggleModeButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
});
