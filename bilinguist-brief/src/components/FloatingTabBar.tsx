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

// ── Tab definitions (display order: Brief → Practice → Settings) ──────────────

const TABS = [
  { route: 'Briefing',    label: 'Brief',    miniLabel: 'The Brief', icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',   label: 'Practice', miniLabel: 'Practice',  icon: 'school' as const,    iconOff: 'school-outline' as const    },
  { route: 'Preferences', label: 'Settings', miniLabel: 'Settings',  icon: 'options' as const,   iconOff: 'options-outline' as const   },
];

// ── Shared geometry ────────────────────────────────────────────────────────────

export const FLOAT_TAB_H      = 50;
export const FLOAT_TAB_BOTTOM = 16;
export const FLOAT_TAB_INSET  = FLOAT_TAB_H + FLOAT_TAB_BOTTOM + 8;

const SW           = Dimensions.get('window').width;
const PILL_GAP     = 12;
const LEFT_MINI_W  = FLOAT_TAB_H; // perfect circle when closed
const RIGHT_MINI_W = 68;          // compact oval — icon stacked above label
const RIGHT_MAX_W  = 240;         // content-fit for 3 nav tabs
// Max left pill width: full bar minus right mini pill and gap
const LEFT_MAX_W   = SW - 16 - RIGHT_MINI_W - PILL_GAP;

// ── Context labels ─────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SettingsSection, string> = {
  reading: 'Reading',
  display: 'Display',
  account: 'Account',
};

// ── StackedSquares — N stacked 2-D square outlines ───────────────────────────

function StackedSquares({ count, size, color }: { count: number; size: number; color: string }) {
  const n      = Math.min(Math.max(count, 1), 5);
  const sq     = Math.round(size * 0.68);
  const step   = n > 1 ? Math.min(Math.floor((size - sq) / (n - 1)), 4) : 0;
  const bounds = n > 1 ? sq + step * (n - 1) : sq;
  return (
    <View style={{ width: bounds, height: bounds }}>
      {Array.from({ length: n }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: sq,
            height: sq,
            borderWidth: 1.5,
            borderColor: color,
            borderRadius: 2,
            top:  step * (n - 1 - i),
            left: step * i,
          }}
        />
      ))}
    </View>
  );
}

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

  // ── Two independent open states ───────────────────────────────────────────
  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // Direct width animated values — targets computed at toggle time
  const leftWidthAnim  = useRef(new Animated.Value(LEFT_MINI_W)).current;
  const rightWidthAnim = useRef(new Animated.Value(RIGHT_MINI_W)).current;

  // Per-pill opacity layers
  const leftIconOp    = useRef(new Animated.Value(1)).current;
  const leftContextOp = useRef(new Animated.Value(0)).current;
  const rightMiniOp   = useRef(new Animated.Value(1)).current;
  const rightFullOp   = useRef(new Animated.Value(0)).current;

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

  // ── Close left pill when switching tabs (context content changes) ─────────
  useEffect(() => {
    setLeftOpen(false);
    Animated.timing(leftWidthAnim,  { toValue: LEFT_MINI_W, duration: 150, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,     { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Animated.timing(leftContextOp,  { toValue: 0, duration: 80,  useNativeDriver: true }).start();
  }, [currentRouteIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Content-fit left expanded width ───────────────────────────────────────
  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      // Brief — always full native names
      if (activeLanguages.length === 0) return LEFT_MINI_W;
      const totalChars = activeLanguages.reduce((s, l) => s + l.nativeName.length, 0);
      return Math.min(totalChars * 7.5 + activeLanguages.length * 22 + 16, LEFT_MAX_W);
    }
    if (currentRouteIndex === 2) return 228; // Reading + Display + Account
    // Practice — ALL + N language codes
    return Math.min((activeLanguages.length + 1) * 44 + 16, LEFT_MAX_W);
  }

  // ── Toggle handlers ────────────────────────────────────────────────────────
  function toggleLeft() {
    const toOpen  = !leftOpen;
    setLeftOpen(toOpen);
    const targetW = toOpen ? computeLeftExpandedW() : LEFT_MINI_W;

    Animated.timing(leftWidthAnim, { toValue: targetW, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(leftIconOp,    { toValue: toOpen ? 0 : 1, duration: toOpen ? 80 : 180, useNativeDriver: true }).start();
    Animated.timing(leftContextOp, { toValue: toOpen ? 1 : 0, duration: toOpen ? 150 : 80, delay: toOpen ? 80 : 0, useNativeDriver: true }).start();
  }

  function toggleRight() {
    const toOpen = !rightOpen;
    setRightOpen(toOpen);

    Animated.timing(rightWidthAnim, { toValue: toOpen ? RIGHT_MAX_W : RIGHT_MINI_W, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
    Animated.timing(rightMiniOp,    { toValue: toOpen ? 0 : 1, duration: toOpen ? 80 : 180, useNativeDriver: true }).start();
    Animated.timing(rightFullOp,    { toValue: toOpen ? 1 : 0, duration: toOpen ? 150 : 80, delay: toOpen ? 80 : 0, useNativeDriver: true }).start();
  }

  // ── Left context content ───────────────────────────────────────────────────

  function renderLeftContext() {
    // Brief — language page tabs
    if (currentRouteIndex === 0) {
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
                {lang.nativeName}
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
          {(['reading', 'display', 'account'] as SettingsSection[]).map((sec) => (
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

  // ── Right nav content ──────────────────────────────────────────────────────

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
    // Render in TABS order: Brief → Practice → Settings
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const pillStyle = {
    backgroundColor: pillBg,
    borderColor: pillBorder,
    shadowColor: '#000' as string,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'ios' ? 0.22 : 0,
    shadowRadius: 24,
    elevation: 16,
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}
    >
      {/* ── Left context pill — anchored left, expands rightward ─────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillLeft, { width: leftWidthAnim }]}>
        {/* StackedSquares icon — visible when closed */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftIconOp }]}
          pointerEvents={leftOpen ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
            <StackedSquares count={activeLanguages.length} size={22} color={activeColor} />
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

      {/* ── Right nav pill — anchored right, expands leftward ───────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillRight, { width: rightWidthAnim }]}>
        {/* Mini (icon above label) — visible when closed */}
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

  // Left pill: anchored to left edge, expands rightward
  pillLeft: {
    left: 0,
  },

  // Right pill: anchored to right edge, expands leftward
  pillRight: {
    right: 0,
  },

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

  // ── Left collapsed ──────────────────────────────────────────────────────
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
