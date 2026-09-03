import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { GameHeader } from './GameHeader';
import { DoneStatRow } from './DoneStatRow';
import { GlassSurface } from './GlassSurface';
import { SpringButton } from './SpringButton';
import { GAME_META, type GameKey } from '../data/gameMeta';
import { makeConfettiHtml } from '../utils/confettiHtml';
import { buildCongratsPool } from '../utils/congrats';
import { useSettingsStore, type LanguageCode } from '../store/useSettingsStore';
import { useWordBankStore } from '../store/useWordBankStore';
import { useShallow } from 'zustand/react/shallow';

// One end-of-game screen for all five practice games. It used to be five
// separate implementations that had drifted on nearly every axis — title
// wording ("Session complete" / "Results" / "{n}/{total} correct"), which
// confetti library rendered, whether a stats box appeared at all, and how
// many buttons the reader got. This is the merge: one layout, one confetti
// implementation, one stat-row component, fed by what each game already knows
// about its own round.

const RAINBOW = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55', '#FFFFFF'];
const CONFETTI_HTML = makeConfettiHtml(RAINBOW, '');

export interface GameEndStat {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  label: string;
  value: number;
}

interface Props {
  gameKey: GameKey;
  /** Fed straight to GameHeader. Speed Snap has no fixed round count, so it
   *  passes total=0 and gets its title text instead of the progress pills. */
  headerCurrent: number;
  headerTotal: number;
  headerResults?: Array<'correct' | 'wrong' | 'skipped'>;
  /** Perfect score, or (Speed Snap) a new personal best — each game decides
   *  what "worth celebrating" means for its own mechanic; this screen just
   *  renders that decision the same way every time. */
  celebrate: boolean;
  /** Speed Snap's "NEW BEST!" badge. Nothing else uses this. */
  celebrateBadge?: string;
  stats: GameEndStat[];
  onPlayAgain: () => void;
  onBack: () => void;
}

export function GameEndScreen({
  gameKey, headerCurrent, headerTotal, headerResults,
  celebrate, celebrateBadge, stats, onPlayAgain, onBack,
}: Props) {
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const meta = GAME_META[gameKey];

  // Only ever congratulate in languages the reader actually uses: their active
  // brief languages plus any language they've saved words in. The pool used to
  // span all nine, so a French-and-German reader could be praised in Turkish.
  const activeLanguages = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)),
  );
  const savedLanguages = useWordBankStore(
    useShallow((s) => [...new Set(s.words.map((w) => w.language))]),
  );
  const pool = React.useMemo(
    () => buildCongratsPool([...new Set([...activeLanguages, ...savedLanguages])] as LanguageCode[]),
    [activeLanguages, savedLanguages],
  );
  const pickPhrase = React.useCallback(
    () => pool[Math.floor(Math.random() * pool.length)],
    [pool],
  );

  // Cycles a single phrase so the praise keeps changing while the reader sits
  // here, landing in a different one of their languages each time.
  const [phrase, setPhrase] = React.useState(pickPhrase);
  const phraseFade = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!celebrate) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cycle = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(phraseFade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
          if (cancelled) return;
          setPhrase(pickPhrase());
          Animated.timing(phraseFade, { toValue: 1, duration: 320, useNativeDriver: true }).start(cycle);
        });
      }, 1900);
    };
    cycle();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      phraseFade.stopAnimation();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
      <GameHeader title={meta.label} current={headerCurrent} total={headerTotal} results={headerResults} />

      {celebrate && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.confettiLayer]}>
          <WebView
            source={{ html: CONFETTI_HTML }}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            scrollEnabled={false}
            bounces={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      <View style={styles.center}>
        {/* Scaled off the reader's heading size so it still tracks their text
            size setting, just larger — this is the headline of the screen. */}
        <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: Math.round(fontSize.heading * 1.5) }]}>
          Score
        </Text>

        {stats.length > 0 && (
          <View style={[styles.statsBox, { backgroundColor: colors.card }]}>
            <View style={{ borderRadius: 16, overflow: 'hidden' }}>
              {stats.map((s, i) => <DoneStatRow key={i} {...s} />)}
            </View>
          </View>
        )}

        {/* Two glass pills, matching the Save-word pill's material: a
            GlassSurface laid down as a background with the label/icon as
            plain siblings on top of it, never passed in as its children — the
            same pattern that sidesteps the Fabric re-parenting crash fixed
            elsewhere tonight. Back sits left (this screen's own back-chevron
            is already top-left, so "back" stays consistently on that side);
            Play again sits right, carrying the game's own tint so the primary
            action still reads as the primary one despite matching material. */}
        <View style={styles.pillRow}>
          <View style={styles.pillShadow}>
            <GameEndPill
              label="Back to practise"
              icon="chevron-back"
              iconColor={colors.inkMid}
              textColor={colors.inkDark}
              isDark={isDark}
              onPress={onBack}
            />
          </View>
          <View style={styles.pillShadow}>
            <GameEndPill
              label="Play again"
              icon="refresh"
              iconColor={meta.tint}
              textColor={colors.inkDark}
              isDark={isDark}
              onPress={onPlayAgain}
            />
          </View>
        </View>

        {/* Praise sits below the buttons: the score and the two actions are what
            the reader came for, and this keeps changing underneath rather than
            pushing them down the screen. */}
        {celebrate && (
          <View style={styles.celebrateBlock}>
            {celebrateBadge && (
              <Text style={[styles.badge, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
                {celebrateBadge}
              </Text>
            )}
            <Animated.Text
              style={[
                styles.congratsLine,
                // Theme's secondary text colour rather than the game's tint, so
                // it tracks whatever colour scheme the reader has set.
                { color: colors.inkMid, fontFamily: fontFamily.bold, opacity: phraseFade },
              ]}
            >
              {phrase}
            </Animated.Text>
          </View>
        )}
      </View>
    </View>
  );
}

function GameEndPill({
  label, icon, iconColor, textColor, isDark, onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  textColor: string;
  isDark: boolean;
  onPress: () => void;
}) {
  const { fontFamily } = useTheme();
  return (
    <SpringButton
      onPress={onPress}
      style={[styles.pill, { backgroundColor: isDark ? 'rgba(40,40,40,0.88)' : 'rgba(255,255,255,0.88)' }]}
    >
      <GlassSurface cornerRadius={99} colorScheme={isDark ? 'dark' : 'light'} intensity={100} />
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={[styles.pillText, { color: textColor, fontFamily: fontFamily.regular }]} numberOfLines={1}>
        {label}
      </Text>
    </SpringButton>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Top-aligned with generous top padding rather than vertically centered —
  // centering a short column (no icon, no streak line now) left it floating
  // in the middle of the screen looking sparse rather than composed.
  // Explicit z-order: a native WebView doesn't reliably sit behind later
  // siblings just from JSX order, so the confetti was painting over the text.
  confettiLayer: { zIndex: 1 },
  center: {
    flex: 1,
    zIndex: 2,
    alignItems: 'center',
    // Centred vertically — pinned to the top with a fixed padding it sat high
    // on the screen. There's enough content now (taller rows, wider gaps) that
    // centring reads composed rather than sparse.
    justifyContent: 'center',
    // Padding at the foot only, so the block centres in the space above it and
    // lands a little higher than true centre — dead centre sat too low.
    paddingBottom: Spacing.xxl * 2,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xxl,
  },
  congratsLine: { fontSize: 22, textAlign: 'center' },
  badge: { fontSize: 14, letterSpacing: 1.2 },
  title: { textAlign: 'center' },
  celebrateBlock: { alignItems: 'center', gap: 10, marginTop: Spacing.md },
  // A floating tile, not a bordered box — shadow instead of a border, matching
  // the card treatment used elsewhere in the app (word tiles, flashcards).
  statsBox: {
    width: '100%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 10,
    elevation: 6,
  },
  // Equal halves, for symmetry. Content-hugging read better proportionally but
  // left the two pills visibly different widths; matching them matters more.
  // The long "Back to practise" label sets the floor here — equal pills that
  // fit it come out at roughly full width, so they stay a little wide.
  pillRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  pillShadow: {
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    borderRadius: 99,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 99,
    paddingVertical: 18,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  pillText: { fontSize: 15 },
});
