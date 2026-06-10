import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, Dimensions, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';
import { useWordBankStore } from '../store/useWordBankStore';

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Preferences', miniLabel: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Practice',    label: 'Practice',    miniLabel: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
  { route: 'Briefing',    label: 'The Brief',   miniLabel: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H       = 52;  // default / both-closed height
export const FLOAT_TAB_H_LARGE = 60;  // right-nav-open height (both pills)
export const FLOAT_TAB_H_SMALL = 44;  // left-pill-open height (both pills)
export const FLOAT_TAB_BOTTOM  = 16;
// Extra 48 = audio pill height (38) + gap above tab bar (10) so content is
// never hidden behind the tab bar or a simultaneously playing audio pill.
export const FLOAT_TAB_INSET   = FLOAT_TAB_H_LARGE + FLOAT_TAB_BOTTOM + 8 + 48;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H;       // initial circle width (default height)
const RIGHT_MINI_W = FLOAT_TAB_H;       // initial circle width (default height)
const RIGHT_MAX_W  = 248;               // expanded nav
// Right circle is FLOAT_TAB_H_SMALL when left is open, so left can be slightly wider
const LEFT_MAX_W   = SW - 32 - FLOAT_TAB_H_SMALL - 12;

// Content-fit width — ROW_PAD = contextRow paddingHorizontal×2 keeps L/R margins symmetric.
// charW differs between ALL-CAPS codes (wider glyphs) and mixed-case words (narrower avg).
const CHIP_PAD = 20;  // paddingHorizontal:10 × 2
const CHIP_GAP = 4;   // gap between chips
const ROW_PAD  = 12;  // paddingHorizontal:6 × 2

function pillContentW(labels: string[]): number {
  const n = labels.length;
  if (n === 0) return LEFT_MINI_W;
  const charW = labels.every(l => l === l.toUpperCase()) ? 7 : 6.5;
  const chars = labels.reduce((s, l) => s + l.length, 0);
  return Math.min(chars * charW + n * CHIP_PAD + (n - 1) * CHIP_GAP + ROW_PAD, LEFT_MAX_W);
}

// ── Context labels ─────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SettingsSection, string> = {
  languages: 'Languages',
  genres:    'Genres',
  display:   'Display',
  account:   'Account',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, fontFamily, isDark, background } = useTheme();
  const insets = useSafeAreaInsets();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active)));
  const savedWords = useWordBankStore(useShallow((s) => s.words));
  const {
    briefPageIndex, setBriefPageIndex,
    settingsSection, setSettingsSection,
    practiceLang, setPracticeLang,
    gameActive,
  } = useNavPillStore();

  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const pillHeightAnim = useRef(new Animated.Value(FLOAT_TAB_H)).current;
  const leftWidthAnim  = useRef(new Animated.Value(LEFT_MINI_W)).current;
  const rightWidthAnim = useRef(new Animated.Value(RIGHT_MINI_W)).current;
  // Opacity-only values for the expandable content layers — JS driver throughout
  // so they can safely coexist with the JS-driven iconScale transform on child views.
  const leftContextOp  = useRef(new Animated.Value(0)).current;
  const rightFullOp    = useRef(new Animated.Value(0)).current;

  // Animated border radius always = height / 2 (perfect capsule / circle)
  const pillRadius = pillHeightAnim.interpolate({
    inputRange:  [FLOAT_TAB_H_SMALL, FLOAT_TAB_H_LARGE],
    outputRange: [FLOAT_TAB_H_SMALL / 2, FLOAT_TAB_H_LARGE / 2],
    extrapolate: 'clamp',
  });

  // Icon scale tracks pill height — proportional to the default 52px size.
  // Kept on JS driver to avoid native/JS driver conflicts with child Animated.Views.
  const iconScale = pillHeightAnim.interpolate({
    inputRange:  [FLOAT_TAB_H_SMALL, FLOAT_TAB_H, FLOAT_TAB_H_LARGE],
    outputRange: [FLOAT_TAB_H_SMALL / FLOAT_TAB_H, 1, FLOAT_TAB_H_LARGE / FLOAT_TAB_H],
    extrapolate: 'clamp',
  });

  // ── Theming ────────────────────────────────────────────────────────────────
  const isNavy  = background === 'softGrey';
  const isCream = background === 'cream';
  const pillBg = isNavy  ? 'rgba(30,45,66,0.93)'
               : isDark  ? 'rgba(22,22,22,0.92)'
               : isCream ? 'rgba(245,240,232,0.95)'
               : 'rgba(255,255,255,0.92)';
  const pillBorder = isNavy  ? 'rgba(255,255,255,0.10)'
                   : isDark  ? 'rgba(255,255,255,0.09)'
                   : isCream ? 'rgba(22,32,50,0.10)'
                   : 'rgba(0,0,0,0.07)';
  const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
  const inactiveColor = isNavy ? 'rgba(245,240,232,0.40)' : colors.inkFaint;
  // Glass chip: white raised card on light themes, frosted bright on dark — no bg on inactive
  const activeChipStyle = (isNavy || isDark) ? {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.28)',
  } : {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.07)',
  };

  const currentRouteIndex = state.index;
  const currentRoute      = state.routes[currentRouteIndex];
  const currentTab        = TABS.find((t) => t.route === currentRoute.name) ?? TABS[0];

  // ── Animation helpers ─────────────────────────────────────────────────────
  // Mini icons (left closed, right mini) use conditional rendering based on
  // React state — this avoids the native/JS driver conflict that caused the
  // icon to disappear. leftContextOp and rightFullOp use useNativeDriver: false
  // so iconScale transforms on child views work without interference.

  // Left opens → both pills shrink to SMALL (44), left expands to content width
  function animOpenLeft(targetW: number) {
    setLeftOpen(true);
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H_SMALL, duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leftWidthAnim,  { toValue: targetW,           duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H_SMALL, duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leftContextOp,  { toValue: 1, duration: 160, delay: 80, useNativeDriver: false }),
    ]).start();
  }

  // Left closes → both pills return to DEFAULT (52)
  function animCloseLeft() {
    setLeftOpen(false);
    leftContextOp.setValue(0); // snap context chips off instantly
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }

  // Right opens → both pills grow to LARGE (60), right expands to full nav
  function animOpenRight() {
    setRightOpen(true);
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H_LARGE, duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(rightWidthAnim, { toValue: RIGHT_MAX_W,        duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H_LARGE, duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(rightFullOp,    { toValue: 1, duration: 160, delay: 80, useNativeDriver: false }),
    ]).start();
  }

  // Right closes → both pills return to DEFAULT (52); always followed by animOpenLeft
  function animCloseRight() {
    setRightOpen(false);
    rightFullOp.setValue(0); // snap full nav off instantly
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      // Brief — ≤4 full native names, 5+ codes
      const labels = activeLanguages.length <= 4
        ? activeLanguages.map((l) => l.nativeName)
        : activeLanguages.map((l) => l.code.toUpperCase());
      return pillContentW(labels);
    }
    if (currentRouteIndex === 2) {
      return pillContentW((['languages', 'genres', 'display', 'account'] as SettingsSection[]).map(s => SECTION_LABELS[s]));
    }
    // Practice — ALL + full native names (≤4 saved langs) or codes (>4)
    const plCodes  = [...new Set(savedWords.map((w) => w.language))].sort();
    const plFull   = plCodes.length <= 4;
    const plOver   = plCodes.length - 4;
    const plLabels = plFull
      ? plCodes.map(c => activeLanguages.find(l => l.code === c)?.nativeName ?? c.toUpperCase())
      : plCodes.slice(0, 4).map(c => c.toUpperCase());
    return pillContentW(['ALL', ...plLabels, ...(plOver > 0 ? [`+${plOver}`] : [])]);
  }

  // ── Toggle handlers — mutually exclusive ─────────────────────────────────

  function toggleLeft() {
    if (leftOpen) {
      animCloseLeft();
    } else {
      if (rightOpen) {
        // Close right inline — animOpenLeft will override height/width targets
        setRightOpen(false);
        rightFullOp.setValue(0);
        Animated.timing(rightWidthAnim, { toValue: RIGHT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
      }
      animOpenLeft(computeLeftExpandedW());
    }
  }

  function toggleRight() {
    if (rightOpen) {
      animCloseRight();
      animOpenLeft(computeLeftExpandedW()); // re-open left on all tabs when right closes
    } else {
      if (leftOpen) {
        // Close left inline — animOpenRight will override height/width targets
        setLeftOpen(false);
        leftContextOp.setValue(0);
        Animated.timing(leftWidthAnim, { toValue: LEFT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
      }
      animOpenRight();
    }
  }

  // ── Auto-open left pill on every tab change ───────────────────────────────

  useEffect(() => {
    animCloseRight();
    animOpenLeft(computeLeftExpandedW());
  }, [currentRouteIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Left context content ──────────────────────────────────────────────────

  function renderLeftContext() {
    // Brief — language page tabs
    if (currentRouteIndex === 0) {
      const showFull = activeLanguages.length <= 4;
      return (
        <View style={styles.contextRow}>
          {activeLanguages.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.contextItem, briefPageIndex === i && activeChipStyle]}
              onPress={() => setBriefPageIndex(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, {
                color:      briefPageIndex === i ? activeColor : inactiveColor,
                fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular,
              }]}>
                {showFull ? lang.nativeName : lang.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    // Preferences — section switcher
    if (currentRouteIndex === 2) {
      return (
        <View style={styles.contextRow}>
          {(['languages', 'genres', 'display', 'account'] as SettingsSection[]).map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[styles.contextItem, settingsSection === sec && activeChipStyle]}
              onPress={() => setSettingsSection(sec)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, {
                color:      settingsSection === sec ? activeColor : inactiveColor,
                fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular,
              }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    // Practice — language filter (only languages that have saved words)
    const savedLangCodes = [...new Set(savedWords.map((w) => w.language))].sort();
    const showFull   = savedLangCodes.length <= 4;
    const visibleLangs = savedLangCodes.slice(0, 4);
    const overflow   = savedLangCodes.length - 4;
    // ≤4 saved langs → full native name; >4 → code abbreviation
    const langLabel  = (code: string) =>
      showFull ? (activeLanguages.find(l => l.code === code)?.nativeName ?? code.toUpperCase()) : code.toUpperCase();
    return (
      <View style={styles.contextRow}>
        <TouchableOpacity
          style={[styles.contextItem, practiceLang === 'all' && activeChipStyle]}
          onPress={() => setPracticeLang('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.contextLabel, {
            color:      practiceLang === 'all' ? activeColor : inactiveColor,
            fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular,
          }]}>
            ALL
          </Text>
        </TouchableOpacity>
        {visibleLangs.map((code) => (
          <TouchableOpacity
            key={code}
            style={[styles.contextItem, practiceLang === code && activeChipStyle]}
            onPress={() => setPracticeLang(code as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.contextLabel, {
              color:      practiceLang === code ? activeColor : inactiveColor,
              fontFamily: practiceLang === code ? fontFamily.bold : fontFamily.regular,
            }]}>
              {langLabel(code)}
            </Text>
          </TouchableOpacity>
        ))}
        {overflow > 0 && (
          <View style={styles.contextItem}>
            <Text style={[styles.contextLabel, { color: inactiveColor, fontFamily: fontFamily.regular }]}>
              +{overflow}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Right nav content ─────────────────────────────────────────────────────

  function renderMiniNav() {
    return (
      <TouchableOpacity style={styles.miniNavButton} onPress={toggleRight} activeOpacity={0.7}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons name={currentTab.icon} size={22} color={activeColor} />
        </Animated.View>
      </TouchableOpacity>
    );
  }

  function renderFullNav() {
    return (
      <View style={styles.fullNavRow}>
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.route);
          if (!route) return null;
          const index     = state.routes.indexOf(route);
          const isFocused = state.index === index;
          const tint      = isFocused ? activeColor : inactiveColor;

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.navTabItem}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                toggleRight();
              }}
            >
              <View style={[styles.navDot, { opacity: isFocused ? 1 : 0, backgroundColor: activeColor }]} />
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={22} color={tint} />
              <Text style={[styles.navLabel, { color: tint, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pillStyle = {
    backgroundColor: pillBg,
    borderColor: pillBorder,
    shadowColor: '#000' as string,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'ios' ? 0.22 : 0,
    shadowRadius: 24,
    elevation: 16,
  };

  // Animated height + border-radius applied inline — override static StyleSheet values
  const animatedPillShape = { height: pillHeightAnim, borderRadius: pillRadius };

  const leftClosedIcon = currentRouteIndex === 2 ? 'menu-outline' : 'layers-outline';

  if (gameActive) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}
    >
      {/* ── Left pill — anchored left ─────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillLeft, animatedPillShape, { width: leftWidthAnim }]}>

        {/* Closed icon: conditionally rendered so no opacity/transform driver conflict */}
        {!leftOpen && (
          <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <Ionicons name={leftClosedIcon} size={20} color={activeColor} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Expanded context chips: fade in after pill grows (delay 80ms) */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftContextOp }]}
          pointerEvents={leftOpen ? 'auto' : 'none'}
        >
          {renderLeftContext()}
        </Animated.View>
      </Animated.View>

      {/* ── Right pill — anchored right ───────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillRight, animatedPillShape, { width: rightWidthAnim }]}>

        {/* Mini icon: conditionally rendered so it's always crisp when visible */}
        {!rightOpen && (
          <View style={styles.absoluteFill}>
            {renderMiniNav()}
          </View>
        )}

        {/* Full nav: fade in after pill grows (delay 80ms), snap off on close */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: rightFullOp }]}
          pointerEvents={rightOpen ? 'auto' : 'none'}
        >
          {renderFullNav()}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: FLOAT_TAB_H_LARGE, // tall enough to contain the largest pill state
  },

  pill: {
    position: 'absolute',
    bottom: 0,           // pills anchor to wrapper bottom — they grow upward
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    // height and borderRadius set via animatedPillShape inline — no static values here
  },

  pillLeft:  { left: 0 },
  pillRight: { right: 0 },

  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'stretch', // children stretch to full pill height for proper centering
  },

  // ── Left context ────────────────────────────────────────────────────────
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingHorizontal: 6,
    gap: 4,
    // height intentionally omitted — fills parent via alignItems: 'stretch'
  },
  contextItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextLabel: {
    fontSize: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Right mini ──────────────────────────────────────────────────────────
  miniNavButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Right full nav ──────────────────────────────────────────────────────
  fullNavRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 2,
  },
  navDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginBottom: 1,
  },
  navLabel: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
