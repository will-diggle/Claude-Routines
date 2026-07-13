import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore, langDisplayCode } from '../store/useSettingsStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';
import { useWordBankStore } from '../store/useWordBankStore';
import { useAudioStore } from '../store/useAudioStore';
import { FlagCircle, GlobeCircle } from './FlagCircle';
import { GlassSurface } from './GlassSurface';
import * as Haptics from 'expo-haptics';

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Briefing',    label: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',    label: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H        = 58;
export const FLOAT_TAB_H_LARGE  = 60;
export const FLOAT_TAB_H_SMALL  = 60; // unified — same height on all pages
export const FLOAT_TAB_H_FLAG      = 60; // unified with LARGE
export const FLOAT_TAB_H_FLAG_2ROW = 100; // 2-row flag chip layout (5+ languages)
export const FLOAT_TAB_BOTTOM   = 16;
export const FLOAT_TAB_INSET    = FLOAT_TAB_H_LARGE + FLOAT_TAB_BOTTOM + 8 + 48;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H;
const RIGHT_MINI_W = FLOAT_TAB_H;
const RIGHT_MAX_W  = 250;
const LEFT_MAX_W   = SW - 32 - FLOAT_TAB_H_SMALL - 12;

// Icon scale targets (relative to default 62px)
const SCALE_DEFAULT = 1;
const SCALE_SMALL   = FLOAT_TAB_H_SMALL / FLOAT_TAB_H;
const SCALE_LARGE   = FLOAT_TAB_H_LARGE / FLOAT_TAB_H;

const CHIP_PAD = 12;
const CHIP_GAP = 4;
const ROW_PAD  = 20;

// Per-label charW: uppercase labels (FR, DE) are wider relative to font size
// than mixed-case (Français, Languages). Uses generous upper-bound estimates
// so any selected font (Playfair, Garamond, Times, Georgia) never overflows.
function pillContentW(labels: string[]): number {
  const n = labels.length;
  if (n === 0) return LEFT_MINI_W;
  const textW = labels.reduce((sum, l) => {
    const charW = l === l.toUpperCase() ? 8.5 : 7.5;
    return sum + l.length * charW;
  }, 0);
  return Math.min(textW + n * CHIP_PAD + (n - 1) * CHIP_GAP + ROW_PAD, LEFT_MAX_W);
}

// Width for a row of flag-circle-only chips (no text label)
function pillFlagOnlyW(count: number): number {
  const chipW = 24 + 7 * 2; // flag size 24 + 7px padding each side
  return Math.min(chipW * count + (count - 1) * CHIP_GAP + ROW_PAD, LEFT_MAX_W);
}

const SECTION_LABELS: Record<SettingsSection, string> = {
  languages: 'Languages', genres: 'Genres', display: 'Display', profile: 'Profile',
};

// ── Left pill context — memoised so it doesn't re-render on every animation frame ──

interface LeftContextProps {
  routeIndex: number;
  activeLanguages: { code: string; nativeName: string }[];
  briefPageIndex: number;
  settingsSection: SettingsSection;
  practiceLang: string;
  savedLangCodes: string[];
  allLanguages: { code: string; nativeName: string }[];
  activeColor: string;
  inactiveColor: string;
  activeChipStyle: object;
  fontFamily: Record<string, string | undefined>;
  onChipGroupLayout: (w: number) => void;
  onBriefLang: (i: number) => void;
  onSettingsSection: (s: SettingsSection) => void;
  onPracticeLang: (code: string) => void;
}

const LeftContext = memo(function LeftContext({
  routeIndex, activeLanguages, briefPageIndex, settingsSection,
  practiceLang, savedLangCodes, allLanguages, activeColor, inactiveColor,
  activeChipStyle, fontFamily, onChipGroupLayout, onBriefLang,
  onSettingsSection, onPracticeLang,
}: LeftContextProps) {
  if (routeIndex === 0) {
    const flagOnly = activeLanguages.length >= 5;
    return (
      <View style={styles.contextRow}>
        <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
          {activeLanguages.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                flagOnly ? styles.contextItemFlagOnly : [styles.contextItem, styles.contextItemFlag],
                briefPageIndex === i && activeChipStyle,
              ]}
              onPress={() => { Haptics.selectionAsync(); onBriefLang(i); }}
              activeOpacity={0.7}
            >
              <FlagCircle code={lang.code} size={flagOnly ? 24 : 20} />
              {!flagOnly && (
                <Text style={[styles.contextLabel, { color: briefPageIndex === i ? activeColor : inactiveColor, fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular, marginTop: 2 }]}>
                  {lang.nativeName}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (routeIndex === 2) {
    return (
      <View style={styles.contextRow}>
        <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
          {(['languages', 'genres', 'display', 'profile'] as SettingsSection[]).map((sec) => (
            <TouchableOpacity key={sec} style={[styles.contextItem, settingsSection === sec && activeChipStyle]} onPress={() => { Haptics.selectionAsync(); onSettingsSection(sec); }} activeOpacity={0.7}>
              <Text style={[styles.contextLabel, { color: settingsSection === sec ? activeColor : inactiveColor, fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  const showFull     = savedLangCodes.length <= 3;
  const visibleLangs = savedLangCodes.slice(0, 4);
  const overflow     = savedLangCodes.length - 4;
  const langLabel    = (code: string) =>
    showFull ? (allLanguages.find(l => l.code === code)?.nativeName ?? langDisplayCode(code)) : langDisplayCode(code);

  return (
    <View style={styles.contextRow}>
      <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
        <TouchableOpacity style={[styles.contextItem, styles.contextItemFlag, practiceLang === 'all' && activeChipStyle]} onPress={() => { Haptics.selectionAsync(); onPracticeLang('all'); }} activeOpacity={0.7}>
          <GlobeCircle size={20} />
          <Text style={[styles.contextLabel, { color: practiceLang === 'all' ? activeColor : inactiveColor, fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular, marginTop: 2 }]}>All</Text>
        </TouchableOpacity>
        {visibleLangs.map((code) => (
          <TouchableOpacity key={code} style={[styles.contextItem, styles.contextItemFlag, practiceLang === code && activeChipStyle]} onPress={() => { Haptics.selectionAsync(); onPracticeLang(code); }} activeOpacity={0.7}>
            <FlagCircle code={code} size={20} />
            <Text style={[styles.contextLabel, { color: practiceLang === code ? activeColor : inactiveColor, fontFamily: practiceLang === code ? fontFamily.bold : fontFamily.regular, marginTop: 2 }]}>
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
    </View>
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, fontFamily, isDark, background } = useTheme();
  const insets = useSafeAreaInsets();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active)));
  const allLanguages    = useSettingsStore(useShallow((s) => s.languages));
  const savedWords = useWordBankStore(useShallow((s) => s.words));
  const {
    briefPageIndex, setBriefPageIndex,
    settingsSection, setSettingsSection,
    practiceLang, setPracticeLang,
    gameActive,
    briefingScrolled,
    audioPillForcedUp, setAudioPillForcedUp,
  } = useNavPillStore(useShallow((s) => ({
    briefPageIndex: s.briefPageIndex,
    setBriefPageIndex: s.setBriefPageIndex,
    settingsSection: s.settingsSection,
    setSettingsSection: s.setSettingsSection,
    practiceLang: s.practiceLang,
    setPracticeLang: s.setPracticeLang,
    gameActive: s.gameActive,
    briefingScrolled: s.briefingScrolled,
    audioPillForcedUp: s.audioPillForcedUp,
    setAudioPillForcedUp: s.setAudioPillForcedUp,
  })));
  const isAudioVisible = useAudioStore(useShallow(s => s.isPlaying || s.isLoading));
  const isAudioDocked  = briefingScrolled && isAudioVisible && !audioPillForcedUp;

  const savedLangCodes = useMemo(
    () => [...new Set(savedWords.map((w) => w.language))].sort(),
    [savedWords],
  );

  // Stable string keys — prevents spurious effect re-runs when savedWords updates
  // (e.g. background backfill) without actually changing which languages exist.
  const activeLanguagesKey = activeLanguages.map((l) => l.code).join(',');
  const savedLangCodesKey  = savedLangCodes.join(',');

  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // Always-current refs — read in effects that omit these from deps to avoid stale closures
  const leftOpenRef  = useRef(false);
  leftOpenRef.current = leftOpen;
  const prevLeftOpenRef = useRef(false); // left state snapshot taken when audio docks

  // Tracks the last measured natural chip-group width so the pill can snap
  // to the true content size regardless of which font is selected.
  const chipGroupMeasuredW = useRef(0);

  function onChipGroupLayout(chipGroupW: number) {
    // Record the measured width for future reference only.
    // The animation target is driven exclusively by computeLeftExpandedW()
    // to prevent constrained mid-animation measurements from overriding the
    // opening animation (which caused the pill to stay stuck at mini size).
    chipGroupMeasuredW.current = Math.min(chipGroupW + ROW_PAD, LEFT_MAX_W);
  }

  // JS-driver: layout properties (width, height) cannot use native driver
  // Each pill has its own height value — sharing one caused conflicts when
  // animToLeftOpen (h=48) and animOpenRight (h=60) ran in close succession.
  const leftHeightAnim  = useRef(new Animated.Value(FLOAT_TAB_H)).current;
  const rightHeightAnim = useRef(new Animated.Value(FLOAT_TAB_H)).current;
  const leftWidthAnim   = useRef(new Animated.Value(LEFT_MINI_W)).current;
  const rightWidthAnim  = useRef(new Animated.Value(RIGHT_MINI_W)).current;

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
               :           'rgba(250,248,246,0.92)';
  // Tint overlay applied on top of GlassSurface so the pill actually reads as
  // dark/grey in night & navy modes — the glass effect alone stays frosted-light.
  const pillTint = isNavy ? 'rgba(22,34,54,0.80)'
                 : isDark ? 'rgba(18,18,18,0.78)'
                 : null;
  const pillBorder = isNavy  ? 'rgba(255,255,255,0.14)'
                   : isDark  ? 'rgba(255,255,255,0.13)'
                   : isCream ? 'rgba(22,32,50,0.14)'
                   :           'rgba(0,0,0,0.11)';
  const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
  const inactiveColor = isNavy ? 'rgba(245,240,232,0.40)' : colors.inkFaint;
  // Dark/navy: dark-tinted chip with a crisp white border so the selected state reads
  // clearly without the jarring "white pill" that rgba(255,255,255,0.18) creates.
  const activeChipStyle = (isNavy || isDark) ? {
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
  } : {
    backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.07)',
  };

  const currentRouteIndex = state.index;
  const currentRoute      = state.routes[currentRouteIndex];
  const currentTab        = TABS.find((t) => t.route === currentRoute.name) ?? TABS[0];

  // ── Animation helpers ─────────────────────────────────────────────────────
  // borderRadius uses a static value of 100 (React Native clamps to height/2,
  // so it always renders as a perfect capsule/circle regardless of pill height).

  // Layout props (width/height) can't use native driver — timing is smoother
  // than spring here because it avoids per-frame spring physics on the JS thread
  // while layout recalculates simultaneously. Cubic ease-out feels lush and snappy.
  const TM_LAYOUT_OPEN  = { duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false } as const;
  const TM_LAYOUT_CLOSE = { duration: 200, easing: Easing.out(Easing.quad),  useNativeDriver: false } as const;
  // Scale runs on UI thread via native driver — spring here is free (no layout cost).
  const SP_SCALE_OPEN  = { stiffness: 200, damping: 14, mass: 0.7, useNativeDriver: true } as const;
  const SP_SCALE_CLOSE = { stiffness: 320, damping: 28, mass: 0.8, useNativeDriver: true } as const;

  function animCloseLeft() {
    setLeftOpen(false);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT, ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animOpenRight() {
    setLeftOpen(false);
    setRightOpen(true);
    leftContextOp.setValue(0);
    leftWidthAnim.setValue(FLOAT_TAB_H_SMALL);
    iconScaleAnim.setValue(SCALE_SMALL);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_LARGE, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_LARGE, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightWidthAnim,  { toValue: RIGHT_MAX_W,        ...TM_LAYOUT_OPEN }),
      Animated.timing(rightFullOp,     { toValue: 1, duration: 40, delay: 200, useNativeDriver: true }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_LARGE, ...SP_SCALE_OPEN }),
    ]).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    Animated.parallel([
      Animated.timing(rightFullOp,     { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT, ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animCloseBoth() {
    setLeftOpen(false);
    setRightOpen(false);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(rightFullOp,     { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H,   ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT, ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animToLeftOpen(targetW: number) {
    setRightOpen(false);
    setLeftOpen(true);
    rightFullOp.setValue(0);
    leftContextOp.setValue(1);
    rightWidthAnim.setValue(FLOAT_TAB_H_SMALL);
    iconScaleAnim.setValue(SCALE_SMALL);
    const targetH =
      currentRouteIndex === 0 || currentRouteIndex === 1
        ? FLOAT_TAB_H_FLAG
        : FLOAT_TAB_H_SMALL;
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: targetH, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightHeightAnim, { toValue: targetH, ...TM_LAYOUT_OPEN }),
      Animated.timing(leftWidthAnim,   { toValue: targetW, ...TM_LAYOUT_OPEN }),
    ]).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      // Briefing — brief language switcher
      // 5+ languages: flag-circle-only chips (no text) in a single row
      if (activeLanguages.length >= 5) return pillFlagOnlyW(activeLanguages.length);
      return pillContentW(activeLanguages.map((l) => l.nativeName));
    }
    if (currentRouteIndex === 2) {
      // Preferences — settings section shortcuts
      return pillContentW((['languages', 'genres', 'display', 'profile'] as SettingsSection[]).map(s => SECTION_LABELS[s]));
    }
    // Practice — word-bank language filter
    const plCodes  = savedLangCodes;
    const plFull   = plCodes.length <= 3;
    const plOver   = plCodes.length - 4;
    const plLabels = plFull
      ? plCodes.map(c => allLanguages.find(l => l.code === c)?.nativeName ?? langDisplayCode(c))
      : plCodes.slice(0, 4).map(c => langDisplayCode(c));
    return Math.max(pillContentW(['ALL', ...plLabels, ...(plOver > 0 ? [`+${plOver}`] : [])]), 100);
  }

  // ── Toggle handlers ───────────────────────────────────────────────────────

  function toggleLeft() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isAudioDocked) { setAudioPillForcedUp(true); }
    if (leftOpen) {
      animCloseLeft();
    } else {
      animToLeftOpen(computeLeftExpandedW());
    }
  }

  function toggleRight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isAudioDocked) { setAudioPillForcedUp(true); }
    if (rightOpen) {
      if (isAudioDocked) {
        animCloseRight();
      } else {
        animToLeftOpen(computeLeftExpandedW());
      }
    } else {
      animOpenRight();
    }
  }

  useEffect(() => {
    chipGroupMeasuredW.current = 0;
    if (isAudioDocked) {
      animCloseRight();
    } else if (currentRouteIndex === 0 && briefingScrolled) {
      // Returning to the Brief tab while still scrolled — keep pill mini
      animCloseLeft();
    } else {
      animToLeftOpen(computeLeftExpandedW());
    }
  }, [currentRouteIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-open the left pill when language content changes (cold-start hydration or
  // user adding/removing languages). Uses string keys so this does NOT fire on
  // every savedWords reference change (e.g. background backfill every 500ms).
  useEffect(() => {
    if (leftOpen && !isAudioDocked) {
      chipGroupMeasuredW.current = 0;
      animToLeftOpen(computeLeftExpandedW());
    }
  }, [activeLanguagesKey, savedLangCodesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brief scroll — collapse left pill when user scrolls down, re-expand at top
  useEffect(() => {
    if (currentRouteIndex !== 0) return; // Briefing tab only (index 0)
    if (briefingScrolled) {
      if (leftOpenRef.current) animCloseLeft();
    } else if (!isAudioDocked) {
      animToLeftOpen(computeLeftExpandedW());
    }
  }, [briefingScrolled]); // eslint-disable-line react-hooks/exhaustive-deps

  // When audio pill docks, close nav pills. When it undocks, restore previous open state.
  useEffect(() => {
    if (isAudioDocked) {
      prevLeftOpenRef.current = leftOpenRef.current;
      animCloseBoth();
    } else if (prevLeftOpenRef.current) {
      prevLeftOpenRef.current = false;
      animToLeftOpen(computeLeftExpandedW());
    }
  }, [isAudioDocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Right nav content ─────────────────────────────────────────────────────

  function renderMiniNav() {
    return (
      <TouchableOpacity style={styles.miniNavButton} onPress={toggleRight} activeOpacity={0.7}>
        <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
          <Ionicons name={currentTab.icon} size={24} color={activeColor} />
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
                Haptics.selectionAsync();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) {
                  // Navigating to a different tab — immediately reset right pill state
                  // and let the currentRouteIndex effect drive the open-left animation.
                  // Calling toggleRight() here too would start a conflicting animation.
                  setRightOpen(false);
                  rightFullOp.setValue(0);
                  navigation.navigate(route.name);
                } else {
                  // Same tab tapped — full toggle (no route change, effect won't fire)
                  toggleRight();
                }
              }}
            >
              <View style={[styles.navDot, { opacity: isFocused ? 1 : 0, backgroundColor: activeColor }]} />
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={24} color={tint} />
              <Text style={[styles.navLabel, { color: tint, fontFamily: fontFamily.regular }]} numberOfLines={1}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const glassColorScheme = (isNavy || isDark) ? 'dark' as const : 'light' as const;

  const pillStyle = {
    borderColor: pillBorder,
    shadowColor: '#000' as string,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 6,
    elevation: 3,
  };

  const leftClosedIcon = 'earth-outline' as const;

  if (gameActive) return null;

  return (
    // Flex-row layout guarantees pills never overlap — spacer fills remaining
    // space and shrinks to 0 before either pill can cross the other.
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}>

      {/* ── Left pill ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { height: leftHeightAnim, width: leftWidthAnim }]}>
        {/* Glass / blur background */}
        <GlassSurface colorScheme={glassColorScheme} fallbackColor={pillBg} />}

        {/* Closed icon */}
        {!leftOpen && (
          <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
                <Ionicons name={leftClosedIcon} size={28} color={activeColor} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Context chips — outer TouchableOpacity lets tapping any empty area close the pill;
             inner chip TouchableOpacitys capture their own presses (innermost responder wins) */}
        <Animated.View style={[styles.absoluteFill, { opacity: leftContextOp }]} pointerEvents={leftOpen ? 'auto' : 'none'}>
          <TouchableOpacity style={styles.absoluteFill} onPress={toggleLeft} activeOpacity={1}>
            <LeftContext
              routeIndex={currentRouteIndex}
              activeLanguages={activeLanguages}
              briefPageIndex={briefPageIndex}
              settingsSection={settingsSection}
              practiceLang={practiceLang}
              savedLangCodes={savedLangCodes}
              allLanguages={allLanguages}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              activeChipStyle={activeChipStyle}
              fontFamily={fontFamily}
              onChipGroupLayout={onChipGroupLayout}
              onBriefLang={setBriefPageIndex}
              onSettingsSection={setSettingsSection}
              onPracticeLang={(code) => setPracticeLang(code as any)}
            />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Spacer — takes all remaining space, preventing any overlap */}
      <View style={styles.pillSpacer} />

      {/* ── Right pill ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { height: rightHeightAnim, width: rightWidthAnim }]}>
        {/* Glass / blur background */}
        <GlassSurface colorScheme={glassColorScheme} fallbackColor={pillBg} />}

        {/* Mini icon */}
        {!rightOpen && (
          <View style={styles.absoluteFill}>
            {renderMiniNav()}
          </View>
        )}

        {/* Full nav */}
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
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  pill: {
    borderWidth: 1,
    borderRadius: 100,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillRim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 100,
    borderWidth: 1,
  },
  // Second inner ring — the bright specular highlight (Liquid Glass glow border)
  pillInnerRim: {
    position: 'absolute',
    top: 1.5, left: 1.5, right: 1.5, bottom: 1.5,
    borderRadius: 100,
    borderWidth: 0.75,
  },

  // Fills all space between the two pills — collapses to 0 before they can touch
  pillSpacer: { flex: 1 },

  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
  // Inner group — sizes to content, reports true width via onLayout
  chipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  contextItem: {
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextItemFlag: {
    flexDirection: 'column',
    paddingVertical: 8,
    gap: 2,
  },
  // Flag-circle-only chip (no text): used when 5+ languages to fit in one row
  contextItemFlagOnly: {
    paddingHorizontal: 7,
    paddingVertical: 9,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
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
    paddingHorizontal: 6,
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 2,
  },
  navDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginBottom: 1,
  },
  navLabel: {
    fontSize: 10,
    letterSpacing: 0,
  },
});
