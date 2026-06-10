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
  { route: 'Preferences', label: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Practice',    label: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
  { route: 'Briefing',    label: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H       = 52;
export const FLOAT_TAB_H_LARGE = 60;
export const FLOAT_TAB_H_SMALL = 44;
export const FLOAT_TAB_BOTTOM  = 16;
export const FLOAT_TAB_INSET   = FLOAT_TAB_H_LARGE + FLOAT_TAB_BOTTOM + 8 + 48;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H;
const RIGHT_MINI_W = FLOAT_TAB_H;
const RIGHT_MAX_W  = 248;
const LEFT_MAX_W   = SW - 32 - FLOAT_TAB_H_SMALL - 12;

// Icon scale targets (relative to default 52px)
const SCALE_DEFAULT = 1;
const SCALE_SMALL   = FLOAT_TAB_H_SMALL / FLOAT_TAB_H;  // ≈ 0.846
const SCALE_LARGE   = FLOAT_TAB_H_LARGE / FLOAT_TAB_H;  // ≈ 1.154

const CHIP_PAD = 20;
const CHIP_GAP = 4;
const ROW_PAD  = 20;

function pillContentW(labels: string[]): number {
  const n = labels.length;
  if (n === 0) return LEFT_MINI_W;
  const charW = labels.every(l => l === l.toUpperCase()) ? 6.5 : 5.8;
  const chars = labels.reduce((s, l) => s + l.length, 0);
  return Math.min(chars * charW + n * CHIP_PAD + (n - 1) * CHIP_GAP + ROW_PAD, LEFT_MAX_W);
}

const SECTION_LABELS: Record<SettingsSection, string> = {
  languages: 'Languages', genres: 'Genres', display: 'Display', account: 'Account',
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

  // JS-driver: layout properties (width, height) cannot use native driver
  const pillHeightAnim = useRef(new Animated.Value(FLOAT_TAB_H)).current;
  const leftWidthAnim  = useRef(new Animated.Value(LEFT_MINI_W)).current;
  const rightWidthAnim = useRef(new Animated.Value(RIGHT_MINI_W)).current;

  // Native-driver: opacity and transform run on the UI thread, keeping them
  // off the JS thread reduces competition with the layout animations above.
  const leftContextOp  = useRef(new Animated.Value(0)).current;
  const rightFullOp    = useRef(new Animated.Value(0)).current;
  const iconScaleAnim  = useRef(new Animated.Value(SCALE_DEFAULT)).current;

  // ── Theming ────────────────────────────────────────────────────────────────
  const isNavy  = background === 'softGrey';
  const isCream = background === 'cream';
  const pillBg = isNavy  ? 'rgba(30,45,66,0.93)'
               : isDark  ? 'rgba(22,22,22,0.92)'
               : isCream ? 'rgba(245,240,232,0.95)'
               :           'rgba(255,255,255,0.92)';
  const pillBorder = isNavy  ? 'rgba(255,255,255,0.10)'
                   : isDark  ? 'rgba(255,255,255,0.09)'
                   : isCream ? 'rgba(22,32,50,0.10)'
                   :           'rgba(0,0,0,0.07)';
  const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
  const inactiveColor = isNavy ? 'rgba(245,240,232,0.40)' : colors.inkFaint;
  const activeChipStyle = (isNavy || isDark) ? {
    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.28)',
  } : {
    backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.07)',
  };

  const currentRouteIndex = state.index;
  const currentRoute      = state.routes[currentRouteIndex];
  const currentTab        = TABS.find((t) => t.route === currentRoute.name) ?? TABS[0];

  // ── Animation helpers ─────────────────────────────────────────────────────
  // borderRadius uses a static value of 100 (React Native clamps to height/2,
  // so it always renders as a perfect capsule/circle). This avoids deriving an
  // animated borderRadius from pillHeightAnim, saving one JS computation per frame.

  const DUR_OPEN  = 200;
  const DUR_CLOSE = 180;
  const EASE      = Easing.out(Easing.cubic);

  function animOpenLeft(targetW: number) {
    setLeftOpen(true);
    Animated.parallel([
      // JS driver — layout
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H_SMALL, duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,  { toValue: targetW,           duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H_SMALL, duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      // Native driver — opacity + transform
      Animated.timing(leftContextOp,  { toValue: 1,           duration: 160, delay: 60, useNativeDriver: true }),
      Animated.timing(iconScaleAnim,  { toValue: SCALE_SMALL,  duration: DUR_OPEN,       useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animCloseLeft() {
    setLeftOpen(false);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(iconScaleAnim,  { toValue: SCALE_DEFAULT, duration: DUR_CLOSE, useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animOpenRight() {
    setRightOpen(true);
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H_LARGE, duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim, { toValue: RIGHT_MAX_W,        duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H_LARGE, duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightFullOp,    { toValue: 1,            duration: 160, delay: 60, useNativeDriver: true }),
      Animated.timing(iconScaleAnim,  { toValue: SCALE_LARGE,  duration: DUR_OPEN,       useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    rightFullOp.setValue(0);
    Animated.parallel([
      Animated.timing(pillHeightAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(iconScaleAnim,  { toValue: SCALE_DEFAULT, duration: DUR_CLOSE, useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      const labels = activeLanguages.length <= 4
        ? activeLanguages.map((l) => l.nativeName)
        : activeLanguages.map((l) => l.code.toUpperCase());
      return pillContentW(labels);
    }
    if (currentRouteIndex === 2) {
      return pillContentW((['languages', 'genres', 'display', 'account'] as SettingsSection[]).map(s => SECTION_LABELS[s]));
    }
    const plCodes  = [...new Set(savedWords.map((w) => w.language))].sort();
    const plFull   = plCodes.length <= 4;
    const plOver   = plCodes.length - 4;
    const plLabels = plFull
      ? plCodes.map(c => activeLanguages.find(l => l.code === c)?.nativeName ?? c.toUpperCase())
      : plCodes.slice(0, 4).map(c => c.toUpperCase());
    return pillContentW(['ALL', ...plLabels, ...(plOver > 0 ? [`+${plOver}`] : [])]);
  }

  // ── Toggle handlers ───────────────────────────────────────────────────────

  function toggleLeft() {
    if (leftOpen) {
      animCloseLeft();
    } else {
      if (rightOpen) {
        setRightOpen(false);
        rightFullOp.setValue(0);
        Animated.timing(rightWidthAnim, { toValue: RIGHT_MINI_W, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }).start();
      }
      animOpenLeft(computeLeftExpandedW());
    }
  }

  function toggleRight() {
    if (rightOpen) {
      animCloseRight();
      animOpenLeft(computeLeftExpandedW());
    } else {
      if (leftOpen) {
        setLeftOpen(false);
        leftContextOp.setValue(0);
        Animated.timing(leftWidthAnim, { toValue: LEFT_MINI_W, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }).start();
      }
      animOpenRight();
    }
  }

  useEffect(() => {
    animCloseRight();
    animOpenLeft(computeLeftExpandedW());
  }, [currentRouteIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Left context content ──────────────────────────────────────────────────

  function renderLeftContext() {
    if (currentRouteIndex === 0) {
      const showFull = activeLanguages.length <= 4;
      return (
        <View style={styles.contextRow}>
          {activeLanguages.map((lang, i) => (
            <TouchableOpacity key={lang.code} style={[styles.contextItem, briefPageIndex === i && activeChipStyle]} onPress={() => setBriefPageIndex(i)} activeOpacity={0.7}>
              <Text style={[styles.contextLabel, { color: briefPageIndex === i ? activeColor : inactiveColor, fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular }]}>
                {showFull ? lang.nativeName : lang.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (currentRouteIndex === 2) {
      return (
        <View style={styles.contextRow}>
          {(['languages', 'genres', 'display', 'account'] as SettingsSection[]).map((sec) => (
            <TouchableOpacity key={sec} style={[styles.contextItem, settingsSection === sec && activeChipStyle]} onPress={() => setSettingsSection(sec)} activeOpacity={0.7}>
              <Text style={[styles.contextLabel, { color: settingsSection === sec ? activeColor : inactiveColor, fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    const savedLangCodes = [...new Set(savedWords.map((w) => w.language))].sort();
    const showFull     = savedLangCodes.length <= 4;
    const visibleLangs = savedLangCodes.slice(0, 4);
    const overflow     = savedLangCodes.length - 4;
    const langLabel    = (code: string) =>
      showFull ? (activeLanguages.find(l => l.code === code)?.nativeName ?? code.toUpperCase()) : code.toUpperCase();
    return (
      <View style={styles.contextRow}>
        <TouchableOpacity style={[styles.contextItem, practiceLang === 'all' && activeChipStyle]} onPress={() => setPracticeLang('all')} activeOpacity={0.7}>
          <Text style={[styles.contextLabel, { color: practiceLang === 'all' ? activeColor : inactiveColor, fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular }]}>ALL</Text>
        </TouchableOpacity>
        {visibleLangs.map((code) => (
          <TouchableOpacity key={code} style={[styles.contextItem, practiceLang === code && activeChipStyle]} onPress={() => setPracticeLang(code as any)} activeOpacity={0.7}>
            <Text style={[styles.contextLabel, { color: practiceLang === code ? activeColor : inactiveColor, fontFamily: practiceLang === code ? fontFamily.bold : fontFamily.regular }]}>
              {langLabel(code)}
            </Text>
          </TouchableOpacity>
        ))}
        {overflow > 0 && (
          <View style={styles.contextItem}>
            <Text style={[styles.contextLabel, { color: inactiveColor, fontFamily: fontFamily.regular }]}>+{overflow}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Right nav content ─────────────────────────────────────────────────────

  function renderMiniNav() {
    return (
      <TouchableOpacity style={styles.miniNavButton} onPress={toggleRight} activeOpacity={0.7}>
        <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
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
              <Text style={[styles.navLabel, { color: tint, fontFamily: fontFamily.regular }]} numberOfLines={1}>{tab.label}</Text>
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

  if (gameActive) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}>

      {/* ── Left pill ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillLeft, { height: pillHeightAnim, width: leftWidthAnim }]}>

        {/* Closed icon — conditional render, iconScaleAnim on native driver */}
        {!leftOpen && (
          <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
                <Ionicons name={leftClosedIcon} size={20} color={activeColor} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Context chips — native-driver opacity fade-in */}
        <Animated.View style={[styles.absoluteFill, { opacity: leftContextOp }]} pointerEvents={leftOpen ? 'auto' : 'none'}>
          {renderLeftContext()}
        </Animated.View>
      </Animated.View>

      {/* ── Right pill ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, styles.pillRight, { height: pillHeightAnim, width: rightWidthAnim }]}>

        {/* Mini icon — conditional render, iconScaleAnim on native driver */}
        {!rightOpen && (
          <View style={styles.absoluteFill}>
            {renderMiniNav()}
          </View>
        )}

        {/* Full nav — native-driver opacity fade-in */}
        <Animated.View style={[styles.absoluteFill, { opacity: rightFullOp }]} pointerEvents={rightOpen ? 'auto' : 'none'}>
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
    height: FLOAT_TAB_H_LARGE,
  },

  pill: {
    position: 'absolute',
    bottom: 0,
    borderWidth: 1,
    borderRadius: 100, // static large value — React Native always clamps to height/2,
    overflow: 'hidden', // so this is always a perfect capsule without animated borderRadius
    justifyContent: 'center',
    alignItems: 'center',
  },

  pillLeft:  { left: 0 },
  pillRight: { right: 0 },

  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexGrow: 1,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 4,
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

  miniNavButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
