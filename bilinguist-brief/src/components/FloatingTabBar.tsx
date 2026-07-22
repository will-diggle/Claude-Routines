import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Easing, Platform,
} from 'react-native';

export const isIOS26Plus =
  Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 26;
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
import { GlassSurface, GlassGroupContainer, glassAvailable } from './GlassSurface';
import * as Haptics from 'expo-haptics';

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Briefing',    label: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',    label: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H        = 68;
export const FLOAT_TAB_H_LARGE  = 68;
export const FLOAT_TAB_H_SMALL  = 52; // closed/mini circle size
export const FLOAT_TAB_H_FLAG      = 68; // unified with LARGE
export const FLOAT_TAB_H_FLAG_2ROW = 108; // 2-row flag chip layout (5+ languages)
export const FLOAT_TAB_BOTTOM   = 16;
// Pills float over content on all iOS versions — screens need this bottom padding.
export const FLOAT_TAB_INSET = FLOAT_TAB_H_LARGE + FLOAT_TAB_BOTTOM + 8 + 48;

const SW           = Dimensions.get('window').width;
const LEFT_MINI_W  = FLOAT_TAB_H_SMALL;
const RIGHT_MINI_W = FLOAT_TAB_H_SMALL;
const RIGHT_MAX_W  = 218;
const LEFT_MAX_W   = SW - 32 - FLOAT_TAB_H_SMALL - 12;

// Icon scale targets — all 1 since icons are sized explicitly for each state
const SCALE_DEFAULT = 1;
const SCALE_SMALL   = 1;
const SCALE_LARGE   = 1;

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

const SECTION_ICONS: Record<SettingsSection, React.ComponentProps<typeof Ionicons>['name']> = {
  languages: 'globe-outline',
  genres:    'pricetags-outline',
  display:   'color-palette-outline',
  profile:   'person-outline',
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
  fontFamily, onChipGroupLayout, onBriefLang,
  onSettingsSection, onPracticeLang,
}: LeftContextProps) {

  const flagOnly = routeIndex === 0 && activeLanguages.length >= 5;

  if (routeIndex === 0) {
    return (
      <View style={styles.contextRow}>
        <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
          {activeLanguages.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={flagOnly ? styles.contextItemFlagOnly : [styles.contextItem, styles.contextItemFlag]}
              onPress={() => { Haptics.selectionAsync(); onBriefLang(i); }}
              activeOpacity={0.7}
              delayPressIn={0}
            >
              <View style={[styles.contextDot, { opacity: briefPageIndex === i ? 1 : 0, backgroundColor: activeColor }]} />
              <FlagCircle code={lang.code} size={flagOnly ? 22 : 20} />
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
      <View style={[styles.fullNavRow, { justifyContent: 'space-evenly' }]}>
        {(['languages', 'genres', 'display', 'profile'] as SettingsSection[]).map((sec) => {
          const isActive = settingsSection === sec;
          return (
            <TouchableOpacity
              key={sec}
              style={[styles.navTabItem, { flex: 0 }]}
              onPress={() => { Haptics.selectionAsync(); onSettingsSection(sec); }}
              activeOpacity={0.7}
              delayPressIn={0}
            >
              <View style={[styles.navDot, { opacity: isActive ? 1 : 0, backgroundColor: activeColor }]} />
              <Ionicons name={SECTION_ICONS[sec]} size={20} color={isActive ? activeColor : inactiveColor} />
              <Text style={[styles.navLabel, { color: isActive ? activeColor : inactiveColor, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]}>
                {SECTION_LABELS[sec]}
              </Text>
            </TouchableOpacity>
          );
        })}
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
        <TouchableOpacity style={[styles.contextItem, styles.contextItemFlag]} onPress={() => { Haptics.selectionAsync(); onPracticeLang('all'); }} activeOpacity={0.7} delayPressIn={0}>
          <View style={[styles.contextDot, { opacity: practiceLang === 'all' ? 1 : 0, backgroundColor: activeColor }]} />
          <GlobeCircle size={20} />
          <Text style={[styles.contextLabel, { color: practiceLang === 'all' ? activeColor : inactiveColor, fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular, marginTop: 2 }]}>All</Text>
        </TouchableOpacity>
        {visibleLangs.map((code, i) => (
          <TouchableOpacity key={code} style={[styles.contextItem, styles.contextItemFlag]} onPress={() => { Haptics.selectionAsync(); onPracticeLang(code); }} activeOpacity={0.7} delayPressIn={0}>
            <View style={[styles.contextDot, { opacity: practiceLang === code ? 1 : 0, backgroundColor: activeColor }]} />
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
  const leftHeightAnim  = useRef(new Animated.Value(FLOAT_TAB_H_SMALL)).current;
  const rightHeightAnim = useRef(new Animated.Value(FLOAT_TAB_H_SMALL)).current;
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
  const pillBg = colors.card;
  const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
  const inactiveColor = isNavy ? 'rgba(245,240,232,0.40)' : colors.inkFaint;
  // Subtle tinted background for the active chip — low enough opacity to not
  // create the white-oval "eye" effect, but visible enough to show selection.
  const activeChipStyle = {
    backgroundColor: isNavy ? 'rgba(245,240,232,0.13)'
                   : isDark  ? 'rgba(255,255,255,0.10)'
                   :           'rgba(0,0,0,0.06)',
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
  const TM_LAYOUT_OPEN  = { duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false } as const;
  const TM_LAYOUT_CLOSE = { duration: 160, easing: Easing.out(Easing.quad),  useNativeDriver: false } as const;
  // Scale runs on UI thread via native driver — spring here is free (no layout cost).
  const SP_SCALE_OPEN  = { stiffness: 200, damping: 14, mass: 0.7, useNativeDriver: true } as const;
  const SP_SCALE_CLOSE = { stiffness: 320, damping: 28, mass: 0.8, useNativeDriver: true } as const;

  function animCloseLeft() {
    setLeftOpen(false);
    setRightOpen(false);
    leftContextOp.setValue(0);
    rightFullOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT,      ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animOpenRight() {
    setLeftOpen(false);
    setRightOpen(true);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_LARGE, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_LARGE, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightWidthAnim,  { toValue: RIGHT_MAX_W,        ...TM_LAYOUT_OPEN }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H_SMALL,  ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightFullOp,     { toValue: 1, duration: 40, delay: 200, useNativeDriver: true }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_LARGE, ...SP_SCALE_OPEN }),
    ]).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    Animated.parallel([
      Animated.timing(rightFullOp,     { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT,      ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animCloseBoth() {
    setLeftOpen(false);
    setRightOpen(false);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(rightFullOp,     { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H_SMALL, ...TM_LAYOUT_CLOSE }),
      Animated.spring(iconScaleAnim,   { toValue: SCALE_DEFAULT,      ...SP_SCALE_CLOSE  }),
    ]).start();
  }

  function animToLeftOpen(targetW: number) {
    setRightOpen(false);
    setLeftOpen(true);
    rightFullOp.setValue(0);
    leftContextOp.setValue(0);
    rightWidthAnim.setValue(FLOAT_TAB_H_SMALL);
    iconScaleAnim.setValue(SCALE_SMALL);
    const targetH = FLOAT_TAB_H_FLAG;
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: targetH, ...TM_LAYOUT_OPEN }),
      Animated.timing(rightHeightAnim, { toValue: targetH, ...TM_LAYOUT_OPEN }),
      Animated.timing(leftWidthAnim,   { toValue: targetW, ...TM_LAYOUT_OPEN }),
      // Fade content in after pill is mostly open to avoid overflow glitch
      Animated.timing(leftContextOp, { toValue: 1, duration: 80, delay: 140, useNativeDriver: true }),
    ]).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(forIndex?: number): number {
    const idx = forIndex ?? currentRouteIndex;
    if (idx === 0) {
      if (activeLanguages.length >= 5) return pillFlagOnlyW(activeLanguages.length);
      return pillContentW(activeLanguages.map((l) => l.nativeName));
    }
    if (idx === 2) {
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
                Haptics.selectionAsync();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) {
                  // Start the same animation immediately (don't wait for the route effect)
                  animToLeftOpen(computeLeftExpandedW(index));
                  navigation.navigate(route.name);
                } else {
                  // Same tab tapped — full toggle (no route change, effect won't fire)
                  toggleRight();
                }
              }}
            >
              <View style={[styles.navDot, { opacity: isFocused ? 1 : 0, backgroundColor: activeColor }]} />
              <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={20} color={tint} />
              <Text style={[styles.navLabel, { color: tint, fontFamily: fontFamily.regular }]} numberOfLines={1}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // When liquid glass is available the outer wrapper is transparent so UIGlassEffect
  // can blur real content behind it. Otherwise keep the solid card background.
  const pillShadow = {
    backgroundColor: glassAvailable ? 'transparent' : pillBg,
    borderWidth: isDark && !glassAvailable ? 1 : 0,
    borderColor: isDark ? colors.borderLight : 'transparent',
    shadowColor: '#000' as string,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: glassAvailable ? 0.12 : 0.08,
    shadowRadius: glassAvailable ? 8 : 3,
    elevation: 3,
  };
  const pillInner = {
    borderWidth: 0,
  };

  const leftClosedIcon = 'earth-outline' as const;

  if (gameActive) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}>

      {/* ── Left pill ──────────────────────────────────────────────────────── */}
      {/* Outer: shadow only (no overflow:hidden so iOS shadow renders) */}
      <Animated.View style={[styles.pillWrapper, pillShadow, { height: leftHeightAnim, width: leftWidthAnim }]}>
        {/* Inner: background + border + overflow:hidden for content clipping */}
        <View style={[styles.pill, pillInner, !glassAvailable && { backgroundColor: pillBg }]}>
          {glassAvailable && <GlassSurface cornerRadius={100} />}
          {/* Closed icon — always mounted, crossfades via opacity so no native
              subview is ever inserted/removed from this container at runtime
              (removal-on-toggle caused an NSRangeException on cold launch). */}
          <Animated.View
            style={[styles.absoluteFill, { opacity: leftContextOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
            pointerEvents={leftOpen ? 'none' : 'auto'}
          >
            <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7} delayPressIn={0}>
              <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
                <Ionicons name={leftClosedIcon} size={22} color={activeColor} />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* Context chips */}
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
        </View>
      </Animated.View>

      {/* Spacer — takes all remaining space, preventing any overlap */}
      <View style={styles.pillSpacer} />

      {/* ── Right pill ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pillWrapper, pillShadow, { height: rightHeightAnim, width: rightWidthAnim }]}>
        <View style={[styles.pill, pillInner, !glassAvailable && { backgroundColor: pillBg }]}>
          {glassAvailable && <GlassSurface cornerRadius={100} />}
          {/* Mini icon — always mounted, crossfades via opacity (see left pill note above) */}
          <Animated.View
            style={[styles.absoluteFill, { opacity: rightFullOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
            pointerEvents={rightOpen ? 'none' : 'auto'}
          >
            {renderMiniNav()}
          </Animated.View>

          {/* Full nav */}
          <Animated.View style={[styles.absoluteFill, { opacity: rightFullOp }]} pointerEvents={rightOpen ? 'auto' : 'none'}>
            {renderFullNav()}
          </Animated.View>
        </View>
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

  pillWrapper: {
    borderRadius: 100,
    // Shadow is applied inline — no overflow:hidden here so iOS shadow renders
  },
  pill: {
    flex: 1,
    borderRadius: 100,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 7,
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
    paddingTop: 2,
    paddingBottom: 8,
    gap: 5,
  },
  // Flag-circle-only chip (no text): used when 5+ languages to fit in one row
  contextItemFlagOnly: {
    flexDirection: 'column',
    paddingHorizontal: 7,
    paddingTop: 4,
    paddingBottom: 6,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  contextLabel: {
    fontSize: 13,
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
    borderRadius: 2,
    marginBottom: 1,
  },
  contextDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginBottom: 1,
  },
  navLabel: {
    fontSize: 11,
    letterSpacing: 0,
  },
});
