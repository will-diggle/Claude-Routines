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

// ── Tab definitions (display order: The Brief → Practice → Settings) ──────────

const TABS = [
  { route: 'Briefing',    label: 'The Brief', miniLabel: 'The Brief', icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',   label: 'Practice',  miniLabel: 'Practice',  icon: 'school' as const,    iconOff: 'school-outline' as const    },
  { route: 'Preferences', label: 'Settings',  miniLabel: 'Settings',  icon: 'options' as const,   iconOff: 'options-outline' as const   },
];

// ── Shared geometry ────────────────────────────────────────────────────────────

export const FLOAT_TAB_H      = 50;
export const FLOAT_TAB_BOTTOM = 16;
export const FLOAT_TAB_INSET  = FLOAT_TAB_H + FLOAT_TAB_BOTTOM + 8;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H; // perfect circle when closed
const RIGHT_MINI_W = 68;
const RIGHT_MAX_W  = 240;
const LEFT_MAX_W   = SW - 16 - RIGHT_MINI_W - 12; // full bar minus right mini + gap

// Matches actual contextRow styles — used for content-fit width calculation
const CHAR_W   = 6.5; // px per glyph at fontSize:11
const CHIP_PAD = 20;  // paddingHorizontal:10 × 2
const CHIP_GAP = 2;   // gap between chips
const ROW_PAD  = 12;  // paddingHorizontal:6 × 2

function pillContentW(labels: string[]): number {
  const n = labels.length;
  if (n === 0) return LEFT_MINI_W;
  const chars = labels.reduce((s, l) => s + l.length, 0);
  return Math.min(chars * CHAR_W + n * CHIP_PAD + (n - 1) * CHIP_GAP + ROW_PAD, LEFT_MAX_W);
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
  const activeItemBg  = isNavy  ? 'rgba(255,255,255,0.14)'
                      : isCream ? 'rgba(22,32,50,0.07)'
                      : 'rgba(0,0,0,0.08)';

  const currentRouteIndex = state.index;
  const currentRoute      = state.routes[currentRouteIndex];
  const currentTab        = TABS.find((t) => t.route === currentRoute.name) ?? TABS[0];

  // ── Animation helpers ─────────────────────────────────────────────────────

  function animOpenLeft(targetW: number) {
    setLeftOpen(true);
    Animated.timing(leftWidthAnim,  { toValue: targetW, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,     { toValue: 0, duration: 80, useNativeDriver: true }).start();
    Animated.timing(leftContextOp,  { toValue: 1, duration: 150, delay: 80, useNativeDriver: true }).start();
  }

  function animCloseLeft() {
    setLeftOpen(false);
    Animated.timing(leftWidthAnim,  { toValue: LEFT_MINI_W, duration: 160, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,     { toValue: 1, duration: 160, useNativeDriver: true }).start();
    Animated.timing(leftContextOp,  { toValue: 0, duration: 80,  useNativeDriver: true }).start();
  }

  function animOpenRight() {
    setRightOpen(true);
    Animated.timing(rightWidthAnim, { toValue: RIGHT_MAX_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(rightMiniOp,    { toValue: 0, duration: 80,  useNativeDriver: true }).start();
    Animated.timing(rightFullOp,    { toValue: 1, duration: 150, delay: 80, useNativeDriver: true }).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    Animated.timing(rightWidthAnim, { toValue: RIGHT_MINI_W, duration: 160, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(rightMiniOp,    { toValue: 1, duration: 160, useNativeDriver: true }).start();
    Animated.timing(rightFullOp,    { toValue: 0, duration: 80,  useNativeDriver: true }).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      // ≤4 languages → full native names; 5+ → abbreviated codes
      const labels = activeLanguages.length <= 4
        ? activeLanguages.map((l) => l.nativeName)
        : activeLanguages.map((l) => l.code.toUpperCase());
      return pillContentW(labels);
    }
    if (currentRouteIndex === 2) {
      return Math.max(pillContentW(['Languages', 'Genres', 'Display', 'Account']), 260);
    }
    // Practice — ALL + language codes
    return pillContentW(['ALL', ...activeLanguages.map((l) => l.code.toUpperCase())]);
  }

  // ── Toggle handlers — mutually exclusive ─────────────────────────────────

  function toggleLeft() {
    if (leftOpen) {
      animCloseLeft();
    } else {
      if (rightOpen) animCloseRight(); // close right before opening left
      animOpenLeft(computeLeftExpandedW());
    }
  }

  function toggleRight() {
    if (rightOpen) {
      animCloseRight();
      // On Settings tab, re-open left pill when right closes
      if (currentRouteIndex === 2) animOpenLeft(computeLeftExpandedW());
    } else {
      if (leftOpen) animCloseLeft(); // close left before opening right
      animOpenRight();
    }
  }

  // ── Auto-open left on Settings; close both when switching tabs ───────────

  useEffect(() => {
    animCloseRight();
    if (currentRouteIndex === 2) {
      // Settings: left pill opens automatically
      const targetW = Math.max(pillContentW(['Languages', 'Genres', 'Display', 'Account']), 260);
      animOpenLeft(targetW);
    } else {
      animCloseLeft();
    }
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
              style={[styles.contextItem, briefPageIndex === i && { backgroundColor: activeItemBg }]}
              onPress={() => setBriefPageIndex(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, {
                color: briefPageIndex === i ? activeColor : inactiveColor,
                fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular,
              }]}>
                {showFull ? lang.nativeName : lang.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }

    // Preferences — section switcher
    if (currentRouteIndex === 2) {
      return (
        <View style={[styles.contextRow, { flex: 1 }]}>
          {(['languages', 'genres', 'display', 'account'] as SettingsSection[]).map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[styles.contextItem, { flex: 1 }, settingsSection === sec && { backgroundColor: activeItemBg }]}
              onPress={() => setSettingsSection(sec)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, {
                color: settingsSection === sec ? activeColor : inactiveColor,
                fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular,
              }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    // Practice — language filter
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextRow} bounces={false}>
        <TouchableOpacity
          style={[styles.contextItem, practiceLang === 'all' && { backgroundColor: activeItemBg }]}
          onPress={() => setPracticeLang('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.contextLabel, {
            color: practiceLang === 'all' ? activeColor : inactiveColor,
            fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular,
          }]}>
            ALL
          </Text>
        </TouchableOpacity>
        {activeLanguages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.contextItem, practiceLang === lang.code && { backgroundColor: activeItemBg }]}
            onPress={() => setPracticeLang(lang.code as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.contextLabel, {
              color: practiceLang === lang.code ? activeColor : inactiveColor,
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
        <Ionicons name={currentTab.icon} size={17} color={activeColor} />
        <Text style={[styles.miniNavLabel, { color: activeColor, fontFamily: fontFamily.regular }]} numberOfLines={1}>
          {currentTab.miniLabel}
        </Text>
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
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={17} color={tint} />
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

  // Left pill closed-state icon: menu on Settings tab, layers elsewhere
  const leftClosedIcon = currentRouteIndex === 2 ? 'menu-outline' : 'layers-outline';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}
    >
      {/* ── Left context pill — anchored left ────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillLeft, { width: leftWidthAnim }]}>
        {/* Icon — visible when closed */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftIconOp }]}
          pointerEvents={leftOpen ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
            <Ionicons name={leftClosedIcon} size={20} color={activeColor} />
          </TouchableOpacity>
        </Animated.View>

        {/* Context tabs — visible when open */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftContextOp }]}
          pointerEvents={leftOpen ? 'auto' : 'none'}
        >
          {renderLeftContext()}
        </Animated.View>
      </Animated.View>

      {/* ── Right nav pill — anchored right ──────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillRight, { width: rightWidthAnim }]}>
        {/* Mini — visible when closed */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: rightMiniOp }]}
          pointerEvents={rightOpen ? 'none' : 'auto'}
        >
          {renderMiniNav()}
        </Animated.View>

        {/* Full nav — visible when open */}
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
    paddingHorizontal: 6,
    gap: 2,
    height: FLOAT_TAB_H,
  },
  contextItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
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

  // ── Right mini — icon stacked above label ───────────────────────────────
  miniNavButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  miniNavLabel: {
    fontSize: 9,
    letterSpacing: 0.3,
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
    gap: 1,
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
