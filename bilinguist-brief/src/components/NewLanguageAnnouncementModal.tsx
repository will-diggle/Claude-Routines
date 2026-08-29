import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import WebView from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { useTheme } from '../hooks/useTheme';
import { makeConfettiHtml } from '../utils/confettiHtml';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump this key to show the announcement once more to all users.
const SEEN_KEY = 'bilinguist-new-lang-pt-v1';

const PT_CONFETTI = ['#009C3B', '#FFDF00', '#002776', '#FFFFFF', '#009C3B'];

export function useNewLanguageAnnouncement() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then(v => {
      if (!v) setShouldShow(true);
    });
  }, []);

  const markSeen = useCallback(() => {
    AsyncStorage.setItem(SEEN_KEY, '1');
    setShouldShow(false);
  }, []);

  return { shouldShow, markSeen };
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

type Phase = 'hidden' | 'showing' | 'draining';

export function NewLanguageAnnouncementModal({ visible, onDismiss }: Props) {
  const { colors, fontFamily, isDark } = useTheme();

  const webViewRef    = useRef<WebView>(null);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveHtml, setLiveHtml]   = useState('');
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const [phase, setPhase] = useState<Phase>('hidden');
  const phaseRef = useRef<Phase>('hidden');

  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    if (!visible) return;
    setLiveHtml(makeConfettiHtml(PT_CONFETTI, '🇧🇷'));
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

  // Tilt-to-toss gravity
  useEffect(() => {
    if (phase === 'hidden') return;
    let sub: { remove: () => void } | undefined;
    try {
      const { Accelerometer } = require('expo-sensors');
      Accelerometer.setUpdateInterval(33);
      sub = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
        if (phaseRef.current === 'draining') return;
        const mag = Math.sqrt(x * x + y * y);
        if (mag < 0.22) return;
        webViewRef.current?.injectJavaScript(`handleGravity(${x / mag},${-y / mag}); true;`);
      });
    } catch {}
    return () => sub?.remove();
  }, [phase === 'hidden']);

  const handleTap = useCallback(() => {
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
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleTap}>
          <View style={styles.backdrop}>
            <Animated.View style={[styles.cardShadow, { transform: [{ scale: scaleAnim }] }]}>
              <Animated.View
                style={[
                  styles.card,
                  { backgroundColor: glassAvailable ? 'transparent' : colors.card, borderColor: colors.borderLight },
                ]}
              >
                {glassAvailable && <GlassSurface cornerRadius={26} colorScheme={isDark ? 'dark' : 'light'} />}
                <Text style={styles.flag}>🇧🇷</Text>
                <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  Nova língua disponível!
                </Text>
                <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                  O Português Brasileiro chegou ao Bilinguist Brief. Bem-vindo ao Brasil! 🎉
                </Text>
                <Text style={[styles.hint, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                  Tap anywhere to continue
                </Text>
              </Animated.View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <WebView
          ref={webViewRef}
          source={{ html: liveHtml }}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onMessage={handleWebViewMessage}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  cardShadow: {
    width: '100%', borderRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  card: {
    width: '100%', borderRadius: 26, paddingVertical: 36, paddingHorizontal: 28,
    alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  flag:      { fontSize: 56, marginBottom: 14 },
  headline:  { fontSize: 26, textAlign: 'center', marginBottom: 12 },
  subtext:   { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  hint:      { fontSize: 13, textAlign: 'center', opacity: 0.7 },
});
