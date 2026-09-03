import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { GameHeader } from './GameHeader';
import { DoneStatRow } from './DoneStatRow';
import { GlassSurface } from './GlassSurface';
import { SpringButton } from './SpringButton';
import { GAME_META, type GameKey } from '../data/gameMeta';
import { makeConfettiHtml } from '../utils/confettiHtml';
import { getCongratsLines } from '../utils/congrats';
import { useSettingsStore } from '../store/useSettingsStore';

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
  streak: number;
  onPlayAgain: () => void;
  onBack: () => void;
}

export function GameEndScreen({
  gameKey, headerCurrent, headerTotal, headerResults,
  celebrate, celebrateBadge, stats, streak, onPlayAgain, onBack,
}: Props) {
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const meta = GAME_META[gameKey];

  const activeLanguages = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)),
  );
  // One line per active language — celebrating in every language being
  // learned reads better for a multi-language app than a single random phrase
  // drawn from all nine languages regardless of which ones the reader uses.
  const congratsLines = React.useMemo(
    () => (celebrate ? getCongratsLines(activeLanguages) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [celebrate],
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
      <GameHeader title={meta.label} current={headerCurrent} total={headerTotal} results={headerResults} />

      {celebrate && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
        <Ionicons name={meta.icon} size={48} color={meta.tint} />

        {celebrate && congratsLines.map((line, i) => (
          <Text
            key={i}
            style={[styles.congratsLine, { color: meta.tint, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}
          >
            {line}
          </Text>
        ))}
        {celebrateBadge && (
          <Text style={[styles.badge, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            {celebrateBadge}
          </Text>
        )}

        <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
          Results
        </Text>

        {stats.length > 0 && (
          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={{ borderRadius: 12, overflow: 'hidden' }}>
              {stats.map((s, i) => <DoneStatRow key={i} {...s} />)}
            </View>
          </View>
        )}

        <Text style={[styles.streakText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
          {streak} day streak
        </Text>

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: 10 },
  congratsLine: { fontSize: 18, textAlign: 'center' },
  badge: { fontSize: 13, letterSpacing: 1 },
  title: { textAlign: 'center', marginTop: 4 },
  statsBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  streakText: { fontSize: 15, marginTop: 2 },
  pillRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  pillText: { fontSize: 15 },
});
