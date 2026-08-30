import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';
import { makeConfettiHtml } from '../utils/confettiHtml';

// ── Colour palettes ───────────────────────────────────────────────────────────
const FLAG_CONFETTI_COLORS: Record<string, string[]> = {
  it: ['#009246', '#FFFFFF', '#CE2B37', '#009246', '#CE2B37'],
  fr: ['#002395', '#FFFFFF', '#ED2939', '#002395', '#ED2939'],
  de: ['#000000', '#DD0000', '#FFCE00', '#DD0000', '#FFCE00'],
  es: ['#AA151B', '#F1BF00', '#AA151B', '#F1BF00', '#C60B1E'],
  pt: ['#009C3B', '#FFDF00', '#002776', '#FFFFFF', '#009C3B'],
  sv: ['#006AA7', '#FECC02', '#006AA7', '#FECC02', '#FFFFFF'],
  tr: ['#E30A17', '#FFFFFF', '#E30A17', '#FFFFFF', '#E30A17'],
  hu: ['#CE2939', '#FFFFFF', '#477050', '#CE2939', '#477050'],
  ar: ['#EF3340', '#FFFFFF', '#009A44', '#231F20', '#EF3340'],
  en: ['#C8102E', '#FFFFFF', '#012169', '#C8102E', '#FFFFFF'],
};
const DEFAULT_CONFETTI_COLORS = [Colors.cream, Colors.accentGold, Colors.accentRed, '#C8C4BC', Colors.navyBg];

const LANG_FLAG_EMOJI: Record<string, string> = {
  fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', it: '🇮🇹',
  pt: '🇧🇷', sv: '🇸🇪', tr: '🇹🇷', hu: '🇭🇺', ar: '🇸🇦', en: '🇬🇧',
};

const STREAK_COPY: Record<string, string> = {
  en: 'Your streak is on fire!',
  fr: 'Ta série est en feu !',
  de: 'Deine Serie brennt!',
  sv: 'Din serie är på hugget!',
  it: 'La tua serie è in fiamme!',
  es: '¡Tu racha está en llamas!',
  tr: 'Seriniz ateşte!',
  hu: 'A sorozatod lángol!',
  pt: 'Sua sequência está em chamas!',
  ar: 'سلسلتك مشتعلة!',
};

const LANG_ENDONYM: Record<string, string> = {
  en: 'English', fr: 'français', de: 'Deutsch', es: 'español',
  it: 'italiano', pt: 'português', sv: 'svenska', tr: 'Türkçe',
  hu: 'magyar', ar: 'عربية',
};

// One-day: "You read 247 English words today."
const WORDS_TODAY_COPY: Record<string, (n: string, lang: string) => string> = {
  en: (n, lang) => `You read ${n} ${lang} words today.`,
  fr: (n, lang) => `Tu as lu ${n} mots en ${lang} aujourd'hui.`,
  de: (n, lang) => `Du hast heute ${n} Wörter auf ${lang} gelesen.`,
  sv: (n, lang) => `Du läste ${n} ${lang}-ord idag.`,
  it: (n, lang) => `Hai letto ${n} parole in ${lang} oggi.`,
  es: (n, lang) => `Has leído ${n} palabras en ${lang} hoy.`,
  pt: (n, lang) => `Você leu ${n} palavras em ${lang} hoje.`,
  tr: (n, lang) => `Bugün ${n} ${lang} kelime okudun.`,
  hu: (n, lang) => `Ma ${n} ${lang} szót olvastál.`,
  ar: (n, lang) => `قرأت ${n} كلمة ${lang} اليوم.`,
};

// Multi-day: "You read 247 English words today — 1,840 since your 5-day streak began."
const WORDS_STREAK_COPY: Record<string, (today: string, total: string, days: string, lang: string) => string> = {
  en: (t, tot, d, lang) => `You read ${t} ${lang} words today — ${tot} since your ${d}-day streak began.`,
  fr: (t, tot, d, lang) => `Tu as lu ${t} mots en ${lang} aujourd'hui — ${tot} depuis ta série de ${d} jours.`,
  de: (t, tot, d, lang) => `Heute ${t} Wörter auf ${lang} — ${tot} seit Beginn deiner ${d}-Tage-Serie.`,
  sv: (t, tot, d, lang) => `${t} ${lang}-ord idag — ${tot} sedan din ${d}-dagarssvit började.`,
  it: (t, tot, d, lang) => `${t} parole in ${lang} oggi — ${tot} dall'inizio della tua serie di ${d} giorni.`,
  es: (t, tot, d, lang) => `${t} palabras en ${lang} hoy — ${tot} desde que comenzó tu racha de ${d} días.`,
  pt: (t, tot, d, lang) => `${t} palavras em ${lang} hoje — ${tot} desde o início da sua sequência de ${d} dias.`,
  tr: (t, tot, d, lang) => `Bugün ${t} ${lang} kelime — ${d} günlük seride toplamda ${tot}.`,
  hu: (t, tot, d, lang) => `Ma ${t} ${lang} szó — ${tot} a ${d} napos sorozatod kezdete óta.`,
  ar: (t, tot, d, lang) => `${t} كلمة ${lang} اليوم — ${tot} كلمة منذ بدء سلسلة ${d} أيام.`,
};

// ── Colour palettes end ───────────────────────────────────────────────────────
// (physics HTML lives in src/utils/confettiHtml.ts)


// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  streakCount: number;
  langCode: string;
  wordsToday: number;
  streakTotal: number;
  onDismiss: () => void;
}

// 'showing' = full experience (blur + card + confetti)
// 'draining' = card+blur gone, confetti falls out the bottom (screen is visible behind)
// 'hidden'   = fully dismissed
type Phase = 'hidden' | 'showing' | 'draining';

export function StreakCelebrationModal({ visible, streakCount, langCode, wordsToday, streakTotal, onDismiss }: Props) {
  const { colors, fontFamily, isDark } = useTheme();

  const confettiColors = FLAG_CONFETTI_COLORS[langCode] ?? DEFAULT_CONFETTI_COLORS;
  const flagEmoji      = LANG_FLAG_EMOJI[langCode] ?? '🏳️';

  const webViewRef   = useRef<WebView>(null);
  const webViewReady = useRef(false);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot the HTML at open-time so it never changes while draining.
  // When onDismiss() fires, the parent resets langCode/streakCount to defaults,
  // which would change confettiHtml and cause the WebView to reload — killing the particles.
  const [liveHtml, setLiveHtml] = useState('');

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const [phase, setPhase] = useState<Phase>('hidden');
  const phaseRef = useRef<Phase>('hidden');
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // Start showing when visible becomes true
  useEffect(() => {
    if (!visible) return;
    // Capture the HTML with the correct colors NOW, before props change on dismiss
    setLiveHtml(makeConfettiHtml(confettiColors, flagEmoji));
    setPhaseSync('showing');
    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1, tension: 200, friction: 6, useNativeDriver: true,
    }).start();
  }, [visible]);

  // If parent dismisses externally while showing, start drain
  useEffect(() => {
    if (!visible && phaseRef.current === 'showing') {
      setPhaseSync('draining');
      webViewRef.current?.injectJavaScript(`startDrainMode(); true;`);
    }
  }, [visible]);

  // Accelerometer → gravity injected into WebView (runs while modal is open)
  useEffect(() => {
    if (phase === 'hidden') return;
    let sub: { remove: () => void } | undefined;
    try {
      const { Accelerometer } = require('expo-sensors');
      Accelerometer.setUpdateInterval(33);
      sub = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
        if (phaseRef.current === 'draining') return; // don't redirect gravity during drain
        const xyMag = Math.sqrt(x * x + y * y);
        if (xyMag < 0.22) return; // phone flat or simulator returning zeros — keep current gravity
        const gx =  x / xyMag;
        const gy = -y / xyMag;
        webViewRef.current?.injectJavaScript(`handleGravity(${gx},${gy}); true;`);
      });
    } catch {
      // expo-sensors unavailable — default gravity (straight down) already set in HTML
    }
    return () => sub?.remove();
  }, [phase === 'hidden']);

  const handleWebViewLoad = () => {
    webViewReady.current = true;
  };

  // User taps: card Modal closes immediately; confetti drains out via non-Modal overlay
  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'showing') return;
    setPhaseSync('draining');
    webViewRef.current?.injectJavaScript(`startDrainMode(); true;`);
    onDismiss();
    // Fallback: if 'drained' message never fires, close the overlay after 3 s
    if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    drainTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'draining') setPhaseSync('hidden');
    }, 3000);
  }, [onDismiss]);

  // WebView posts 'drained' when all particles have left the screen
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    if (event.nativeEvent.data === 'drained') {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      setPhaseSync('hidden');
    }
  }, []);

  const toArabicNumerals = (n: number) =>
    String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
  const displayCount = langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount);

  const fmt = (n: number) => {
    const s = langCode === 'ar' ? toArabicNumerals(n) : n.toLocaleString('en');
    return s;
  };

  const langName = LANG_ENDONYM[langCode] ?? langCode;

  let copy: string;
  if (wordsToday > 0) {
    // The streak total only earns its clause when it actually exceeds today —
    // otherwise the sentence prints the same number twice ("839 today — 839
    // since your streak began"), which reads as a bug rather than a total.
    if (streakCount <= 1 || streakTotal <= wordsToday) {
      copy = (WORDS_TODAY_COPY[langCode] ?? WORDS_TODAY_COPY.en)(fmt(wordsToday), langName);
    } else {
      copy = (WORDS_STREAK_COPY[langCode] ?? WORDS_STREAK_COPY.en)(
        fmt(wordsToday), fmt(streakTotal), langCode === 'ar' ? toArabicNumerals(streakCount) : String(streakCount), langName
      );
    }
  } else {
    copy = STREAK_COPY[langCode] ?? 'Your streak is on fire!';
  }

  if (phase === 'hidden') return null;

  return (
    <>
      {/* Blur + dim — pointerEvents="none" so the brief stays tappable if we need.
          In a regular View (no Modal) pointerEvents actually propagates correctly. */}
      {phase === 'showing' && (
        <>
          <BlurView intensity={5} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" />
        </>
      )}

      {/* Card — tap anywhere to dismiss */}
      {phase === 'showing' && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleTap}>
          <View style={styles.backdrop} pointerEvents="none">
            <Animated.View style={[styles.cardShadow, { transform: [{ scale: scaleAnim }] }]}>
              <Animated.View
                style={[
                  styles.card,
                  { backgroundColor: glassAvailable ? 'transparent' : colors.card, borderColor: colors.borderLight },
                ]}
              >
                {glassAvailable && <GlassSurface cornerRadius={26} colorScheme={isDark ? 'dark' : 'light'} />}
                <Ionicons name="flame" size={64} color="#F97316" style={styles.flameIcon} />
                <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  {`${displayCount} day streak!`}
                </Text>
                <Text style={[styles.subtext, { color: colors.inkLight, fontFamily: fontFamily.italic }]}>
                  {copy}
                </Text>
              </Animated.View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {/* Confetti WebView — rendered last so it sits above the card.
          pointerEvents="none" on a plain View (no Modal) genuinely passes all touches
          through, so the brief is scrollable the moment the card disappears. */}
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
    width: '100%', borderRadius: 26, paddingVertical: 36, paddingHorizontal: 28,
    alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  flameIcon: { marginBottom: 16 },
  headline:  { fontSize: 28, textAlign: 'center', marginBottom: 12 },
  // Held short of the card's full width so the italic wraps to balanced lines
  // rather than one long line and a two-word orphan.
  subtext:   { fontSize: 15, textAlign: 'center', lineHeight: 23, maxWidth: '90%' },
});
