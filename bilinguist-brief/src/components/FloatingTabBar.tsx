import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Platform, Dimensions, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Preferences', miniLabel: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Practice',    label: 'Practice',    miniLabel: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
  { route: 'Briefing',    label: 'The Brief',   miniLabel: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H      = 52;
export const FLOAT_TAB_BOTTOM = 16;
export const FLOAT_TAB_INSET  = FLOAT_TAB_H + FLOAT_TAB_BOTTOM + 8;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H;       // perfect circle
const RIGHT_MINI_W = FLOAT_TAB_H;       // perfect circle
const RIGHT_MAX_W  = 248;               // expanded nav
const LEFT_MAX_W   = SW - 16 - RIGHT_MINI_W - 12; // full bar minus right circle + gap

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
  const {
    briefPageIndex, setBriefPageIndex,
    settingsSection, setSettingsSection,
    practiceLang, setPracticeLang,
  } = useNavPillStore();

  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const leftWidthAnim  = useRef(new Animated.Value(LEFT_MINI_W)).current;
  const rightWidthAnim = useRef(new Animated.Value(RIGHT_MINI_W)).current;
  const leftIconOp     = useRef(new Animated.Value(1)).current;
  const leftContextOp  = useRef(new Animated.Value(0)).current;
  const rightMiniOp    = useRef(new Animated.Value(1)).current;
  const rightFullOp    = useRef(new Animated.Value(0)).current;

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

  function animOpenLeft(targetW: number) {
    setLeftOpen(true);
    Animated.timing(leftWidthAnim,  { toValue: targetW,    duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,     { toValue: 0,          duration: 80,  useNativeDriver: true }).start();
    Animated.timing(leftContextOp,  { toValue: 1,          duration: 160, delay: 80, useNativeDriver: true }).start();
  }

  function animCloseLeft() {
    setLeftOpen(false);
    Animated.timing(leftWidthAnim,  { toValue: LEFT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,     { toValue: 1,           duration: 180, useNativeDriver: true }).start();
    Animated.timing(leftContextOp,  { toValue: 0,           duration: 80,  useNativeDriver: true }).start();
  }

  function animOpenRight() {
    setRightOpen(true);
    Animated.timing(rightWidthAnim, { toValue: RIGHT_MAX_W,  duration: 200, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(rightMiniOp,    { toValue: 0,            duration: 80,  useNativeDriver: true }).start();
    Animated.timing(rightFullOp,    { toValue: 1,            duration: 160, delay: 80, useNativeDriver: true }).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    Animated.timing(rightWidthAnim, { toValue: RIGHT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(rightMiniOp,    { toValue: 1,            duration: 180, useNativeDriver: true }).start();
    Animated.timing(rightFullOp,    { toValue: 0,            duration: 80,  useNativeDriver: true }).start();
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
    // Practice — ALL + language codes
    return pillContentW(['ALL', ...activeLanguages.map((l) => l.code.toUpperCase())]);
  }

  // ── Toggle handlers — mutually exclusive ─────────────────────────────────

  function toggleLeft() {
    if (leftOpen) {
      animCloseLeft();
    } else {
      if (rightOpen) {
        setRightOpen(false);
        Animated.timing(rightWidthAnim, { toValue: RIGHT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
        Animated.timing(rightMiniOp,    { toValue: 1, duration: 100, useNativeDriver: true }).start();
        Animated.timing(rightFullOp,    { toValue: 0, duration: 80,  useNativeDriver: true }).start();
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
        setLeftOpen(false);
        Animated.timing(leftWidthAnim, { toValue: LEFT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
        Animated.timing(leftIconOp,    { toValue: 1, duration: 180, useNativeDriver: true }).start();
        Animated.timing(leftContextOp, { toValue: 0, duration: 80,  useNativeDriver: true }).start();
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextRow} bounces={false}>
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
        </ScrollView>
      );
    }

    // Preferences — section switcher (ScrollView so chips are natural width, no wrapping)
    if (currentRouteIndex === 2) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextRow} bounces={false}>
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
        </ScrollView>
      );
    }

    // Practice — language filter
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextRow} bounces={false}>
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
        {activeLanguages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.contextItem, practiceLang === lang.code && activeChipStyle]}
            onPress={() => setPracticeLang(lang.code as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.contextLabel, {
              color:      practiceLang === lang.code ? activeColor : inactiveColor,
              fontFamily: practiceLang === lang.code ? fontFamily.bold : fontFamily.regular,
            }]}>
              {lang.code.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── Right nav content ─────────────────────────────────────────────────────

  function renderMiniNav() {
    return (
      <TouchableOpacity style={styles.miniNavButton} onPress={toggleRight} activeOpacity={0.7}>
        <Ionicons name={currentTab.icon} size={22} color={activeColor} />
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
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={18} color={tint} />
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

  const leftClosedIcon = currentRouteIndex === 2 ? 'menu-outline' : 'layers-outline';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}
    >
      {/* ── Left pill — anchored left ─────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillLeft, { width: leftWidthAnim }]}>
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftIconOp }]}
          pointerEvents={leftOpen ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
            <Ionicons name={leftClosedIcon} size={20} color={activeColor} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          style={[styles.absoluteFill, { opacity: leftContextOp }]}
          pointerEvents={leftOpen ? 'auto' : 'none'}
        >
          {renderLeftContext()}
        </Animated.View>
      </Animated.View>

      {/* ── Right pill — anchored right ───────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillRight, { width: rightWidthAnim }]}>
        <Animated.View
          style={[styles.absoluteFill, { opacity: rightMiniOp }]}
          pointerEvents={rightOpen ? 'none' : 'auto'}
        >
          {renderMiniNav()}
        </Animated.View>

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
    left: 8,
    right: 8,
    height: FLOAT_TAB_H,
  },

  pill: {
    position: 'absolute',
    height: FLOAT_TAB_H,
    borderRadius: FLOAT_TAB_H / 2,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },

  pillLeft:  { left: 0 },
  pillRight: { right: 0 },

  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Left context ────────────────────────────────────────────────────────
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingHorizontal: 6,
    gap: 4,
    height: FLOAT_TAB_H,
  },
  contextItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
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
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 2,
  },
  navDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginBottom: 1,
  },
  navLabel: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
});
