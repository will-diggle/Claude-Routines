import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Platform, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Settings', miniLabel: 'Settings', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Briefing',    label: 'Brief',    miniLabel: 'Brief',    icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',   label: 'Practice', miniLabel: 'Practice', icon: 'school' as const,    iconOff: 'school-outline' as const    },
];

// ── Shared geometry ────────────────────────────────────────────────────────────

export const FLOAT_TAB_H      = 50;
export const FLOAT_TAB_BOTTOM = 16;
export const FLOAT_TAB_INSET  = FLOAT_TAB_H + FLOAT_TAB_BOTTOM + 8;

const SW = Dimensions.get('window').width;
// Total pill area: screen - left(8) - right(8) - gap(12) = SW - 28
const PILL_GAP     = 12;
const RIGHT_MINI_W = 86;
const LEFT_MINI_W  = FLOAT_TAB_H; // equals height → perfect circle when collapsed
const LEFT_MAX_W   = SW - 28 - RIGHT_MINI_W;
const RIGHT_MAX_W  = SW - 28 - LEFT_MINI_W;

// ── Context labels ─────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SettingsSection, string> = {
  reading: 'Reading',
  display: 'Display',
  account: 'Account',
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

  const [navOpen, setNavOpen] = useState(false);
  const navAnim = useRef(new Animated.Value(0)).current;

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

  // Width animation
  const leftW = navAnim.interpolate({ inputRange: [0, 1], outputRange: [LEFT_MAX_W, LEFT_MINI_W] });
  const rightW = navAnim.interpolate({ inputRange: [0, 1], outputRange: [RIGHT_MINI_W, RIGHT_MAX_W] });

  // Content opacity cross-fades
  const leftContextOp = navAnim.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: 'clamp' });
  const leftIconOp    = navAnim.interpolate({ inputRange: [0.65, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const rightMiniOp   = navAnim.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: 'clamp' });
  const rightFullOp   = navAnim.interpolate({ inputRange: [0.65, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  function toggleNav() {
    const toOpen = !navOpen;
    setNavOpen(toOpen);
    Animated.spring(navAnim, {
      toValue: toOpen ? 1 : 0,
      useNativeDriver: false,
      tension: 80,
      friction: 14,
    }).start();
  }

  const currentRouteIndex = state.index;
  const currentRoute = state.routes[currentRouteIndex];
  const currentTab = TABS.find((t) => t.route === currentRoute.name) ?? TABS[1];

  // ── Left context content ───────────────────────────────────────────────────

  function renderLeftContext() {
    // Brief (index 1): language page tabs
    if (currentRouteIndex === 1) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.contextRow}
          bounces={false}
        >
          {activeLanguages.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.contextItem, briefPageIndex === i && { backgroundColor: activeItemBg }]}
              onPress={() => setBriefPageIndex(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, { color: briefPageIndex === i ? activeColor : inactiveColor, fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular }]}>
                {activeLanguages.length <= 3 ? lang.nativeName : lang.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }

    // Preferences (index 0): section switcher
    if (currentRouteIndex === 0) {
      return (
        <View style={[styles.contextRow, { flex: 1 }]}>
          {(['reading', 'display', 'account'] as SettingsSection[]).map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[styles.contextItem, { flex: 1 }, settingsSection === sec && { backgroundColor: activeItemBg }]}
              onPress={() => setSettingsSection(sec)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contextLabel, { color: settingsSection === sec ? activeColor : inactiveColor, fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    // Practice (index 2): language filter
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contextRow}
        bounces={false}
      >
        <TouchableOpacity
          style={[styles.contextItem, practiceLang === 'all' && { backgroundColor: activeItemBg }]}
          onPress={() => setPracticeLang('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.contextLabel, { color: practiceLang === 'all' ? activeColor : inactiveColor, fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular }]}>
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
            <Text style={[styles.contextLabel, { color: practiceLang === lang.code ? activeColor : inactiveColor, fontFamily: practiceLang === lang.code ? fontFamily.bold : fontFamily.regular }]}>
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
      <TouchableOpacity style={styles.miniNavButton} onPress={toggleNav} activeOpacity={0.7}>
        <Ionicons name={currentTab.icon} size={20} color={activeColor} />
        <Text style={[styles.miniNavLabel, { color: activeColor, fontFamily: fontFamily.regular }]} numberOfLines={1}>
          {currentTab.miniLabel}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderFullNav() {
    return (
      <View style={styles.fullNavRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tab = TABS.find((t) => t.route === route.name) ?? TABS[1];
          const tint = isFocused ? activeColor : inactiveColor;

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.navTabItem}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                toggleNav();
              }}
            >
              <View style={[styles.navDot, { opacity: isFocused ? 1 : 0, backgroundColor: activeColor }]} />
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={20} color={tint} />
              <Text style={[styles.navLabel, { color: tint, fontFamily: fontFamily.regular }]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

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
      {/* ── Left context pill ──────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { width: leftW }]}>
        {/* Context tabs — visible when nav is closed */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftContextOp }]}
          pointerEvents={navOpen ? 'none' : 'auto'}
        >
          {renderLeftContext()}
        </Animated.View>

        {/* Stacked-layers icon — visible when nav is open */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: leftIconOp }]}
          pointerEvents={navOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={styles.centerFill} onPress={toggleNav} activeOpacity={0.7}>
            <Ionicons name="layers-outline" size={22} color={activeColor} />
            {activeLanguages.length > 1 && (
              <View style={[styles.badge, { backgroundColor: isNavy ? '#F5F0E8' : colors.inkDark }]}>
                <Text style={[styles.badgeText, { color: isNavy ? colors.inkDark : '#FFF' }]}>
                  {activeLanguages.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* ── Right nav pill ─────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { width: rightW }]}>
        {/* Mini (icon + label) — visible when nav is closed */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: rightMiniOp }]}
          pointerEvents={navOpen ? 'none' : 'auto'}
        >
          {renderMiniNav()}
        </Animated.View>

        {/* Full nav — visible when nav is open */}
        <Animated.View
          style={[styles.absoluteFill, { opacity: rightFullOp }]}
          pointerEvents={navOpen ? 'auto' : 'none'}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_GAP,
  },

  pill: {
    height: FLOAT_TAB_H,
    borderRadius: FLOAT_TAB_H / 2,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Shared fill helpers
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
  badge: {
    position: 'absolute',
    top: 10,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // ── Right mini nav ──────────────────────────────────────────────────────
  miniNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  miniNavLabel: {
    fontSize: 11,
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
    gap: 2,
    paddingTop: 2,
  },
  navDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 1,
  },
  navLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
