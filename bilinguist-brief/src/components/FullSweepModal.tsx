import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import WebView from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { makeConfettiHtml } from '../utils/confettiHtml';
import { FlagCircle } from './FlagCircle';
import type { LanguageCode } from '../store/useSettingsStore';

const RAINBOW_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#AF52DE', '#FF2D55', '#FFFFFF',
];

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', sv: 'Swedish',
  it: 'Italian', es: 'Spanish', tr: 'Turkish', hu: 'Hungarian', ar: 'Arabic',
};

interface Props {
  visible: boolean;
  langCodes: string[];
  onDismiss: () => void;
}

type Phase = 'hidden' | 'showing' | 'draining';

export function FullSweepModal({ visible, langCodes, onDismiss }: Props) {
  const { colors, fontFamily, isDark } = useTheme();

  const webViewRef    = useRef<WebView>(null);
  const webViewReady  = useRef(false);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveHtml, setLiveHtml] = useState('');
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const [phase, setPhase] = useState<Phase>('hidden');
  const phaseRef = useRef<Phase>('hidden');
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    if (!visible) return;
    setLiveHtml(makeConfettiHtml(RAINBOW_COLORS, ''));
    setPhaseSync('showing');
    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();
  }, [visible]);

  useEffect(() => {
    if (!visible && phaseRef.current === 'showing') {
      setPhaseSync('draining');
      webViewRef.current?.injectJavaScript(`startDrainMode(); true;`);
    }
  }, [visible]);

  useEffect(() => {
    if (phase === 'hidden') return;
    let sub: { remove: () => void } | undefined;
    try {
      const { Accelerometer } = require('expo-sensors');
      Accelerometer.setUpdateInterval(33);
      sub = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
        if (phaseRef.current === 'draining') return;
        const xyMag = Math.sqrt(x * x + y * y);
        if (xyMag < 0.22) return;
        const gx =  x / xyMag;
        const gy = -y / xyMag;
        webViewRef.current?.injectJavaScript(`handleGravity(${gx},${gy}); true;`);
      });
    } catch {
      // expo-sensors unavailable
    }
    return () => sub?.remove();
  }, [phase === 'hidden']);

  const handleDismiss = useCallback(() => {
    if (phaseRef.current !== 'showing') return;
    setPhaseSync('draining');
    webViewRef.current?.injectJavaScript(`startDrainMode(); true;`);
    onDismiss();
    if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    drainTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'draining') setPhaseSync('hidden');
    }, 3000);
  }, [onDismiss]);

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    if (event.nativeEvent.data === 'drained') {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      setPhaseSync('hidden');
    }
  }, []);

  const handleWebViewLoad = () => { webViewReady.current = true; };

  const langList = langCodes.map(c => LANG_NAMES[c] ?? c);
  const last = langList.pop();
  const subtext = langList.length > 0
    ? `You've read today's brief in ${langList.join(', ')} and ${last}. Impressive.`
    : `You've read today's brief in ${last}. Impressive.`;

  if (phase === 'hidden') return null;

  return (
    <>
      {phase === 'showing' && (
        <>
          <BlurView intensity={5} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" />
        </>
      )}

      {phase === 'showing' && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss}>
          <View style={styles.backdrop} pointerEvents="none">
            <Animated.View style={[styles.cardShadow, { transform: [{ scale: scaleAnim }] }]}>
              <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                <View style={styles.flagsRow}>
                  {langCodes.map(c => (
                    <FlagCircle key={c} code={c as LanguageCode} size={36} />
                  ))}
                </View>
                <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  Full sweep!
                </Text>
                <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
                  {subtext}
                </Text>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.inkDark }]}
                  onPress={handleDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.buttonText, { color: colors.surface, fontFamily: fontFamily.bold }]}>
                    That's my daily dose
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {/* Confetti — rendered last so it sits above the card */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <WebView
          ref={webViewRef}
          source={{ html: liveHtml }}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onLoad={handleWebViewLoad}
          onMessage={handleWebViewMessage}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  cardShadow: {
    width: '100%', borderRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  card: {
    width: '100%', borderRadius: 26, paddingVertical: 44, paddingHorizontal: 32,
    alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  flagsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 10, marginBottom: 18,
  },
  headline: {
    fontSize: 32, textAlign: 'center', marginBottom: 12,
  },
  subtext: {
    fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 24,
  },
  button: {
    paddingVertical: 15, paddingHorizontal: 36, borderRadius: 10,
  },
  buttonText: {
    fontSize: 15, letterSpacing: 0.3,
  },
});
