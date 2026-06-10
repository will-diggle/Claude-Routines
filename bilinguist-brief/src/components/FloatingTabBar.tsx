import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import { useAudioStore } from '../store/useAudioStore';

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { route: 'Preferences', label: 'Preferences', icon: 'options' as const,   iconOff: 'options-outline' as const   },
  { route: 'Briefing',    label: 'The Brief',   icon: 'newspaper' as const, iconOff: 'newspaper-outline' as const },
  { route: 'Practice',    label: 'Practice',    icon: 'school' as const,    iconOff: 'school-outline' as const    },
];

// ── Geometry ───────────────────────────────────────────────────────────────────

export const FLOAT_TAB_H       = 52;
export const FLOAT_TAB_H_LARGE = 60;
export const FLOAT_TAB_H_SMALL = 48;
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

const CHIP_PAD = 12; // 6px each side — matches contextItem.paddingHorizontal × 2
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
    const target = Math.min(chipGroupW + ROW_PAD, LEFT_MAX_W);
    // Threshold of 10px filters out bold↔regular font weight jitter on chip selection
    if (Math.abs(target - chipGroupMeasuredW.current) < 10) return;
    chipGroupMeasuredW.current = target;
    // Only adjust while open — closed pill uses animCloseLeft's fixed target
    if (!leftOpen) return;
    Animated.spring(leftWidthAnim, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 0,
      speed: 30,
    }).start();
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
  // so it always renders as a perfect capsule/circle regardless of pill height).

  const DUR_OPEN  = 200;
  const DUR_CLOSE = 180;
  const EASE      = Easing.out(Easing.cubic);

  function animCloseLeft() {
    setLeftOpen(false);
    leftContextOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(iconScaleAnim,   { toValue: SCALE_DEFAULT, duration: DUR_CLOSE, useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animOpenRight() {
    setRightOpen(true);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_LARGE, duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_LARGE, duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim,  { toValue: RIGHT_MAX_W,        duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H_LARGE, duration: DUR_OPEN, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightFullOp,     { toValue: 1,            duration: 160, delay: 60, useNativeDriver: true }),
      Animated.timing(iconScaleAnim,   { toValue: SCALE_LARGE,  duration: DUR_OPEN,       useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animCloseRight() {
    setRightOpen(false);
    rightFullOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(iconScaleAnim,   { toValue: SCALE_DEFAULT, duration: DUR_CLOSE, useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animCloseBoth() {
    setLeftOpen(false);
    setRightOpen(false);
    leftContextOp.setValue(0);
    rightFullOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,   { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H, duration: DUR_CLOSE, useNativeDriver: false, easing: EASE }),
      Animated.timing(iconScaleAnim,   { toValue: SCALE_DEFAULT, duration: DUR_CLOSE, useNativeDriver: true, easing: EASE }),
    ]).start();
  }

  function animToLeftOpen(targetW: number) {
    const openW = chipGroupMeasuredW.current > 0 ? chipGroupMeasuredW.current : targetW;
    setRightOpen(false);
    setLeftOpen(true);
    rightFullOp.setValue(0);
    Animated.parallel([
      Animated.timing(leftHeightAnim,  { toValue: FLOAT_TAB_H_SMALL, duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(rightHeightAnim, { toValue: FLOAT_TAB_H_SMALL, duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(leftWidthAnim,   { toValue: openW,              duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(rightWidthAnim,  { toValue: FLOAT_TAB_H_SMALL, duration: DUR_OPEN,  useNativeDriver: false, easing: EASE }),
      Animated.timing(leftContextOp,   { toValue: 1,                  duration: DUR_OPEN,  useNativeDriver: true,  easing: EASE }),
      Animated.timing(iconScaleAnim,   { toValue: SCALE_SMALL,        duration: DUR_OPEN,  useNativeDriver: true,  easing: EASE }),
    ]).start();
  }

  // ── Content-fit left expanded width ──────────────────────────────────────

  function computeLeftExpandedW(): number {
    if (currentRouteIndex === 0) {
      // Briefing — brief language switcher
      const labels = activeLanguages.length <= 4
        ? activeLanguages.map((l) => l.nativeName)
        : activeLanguages.map((l) => l.code.toUpperCase());
      return pillContentW(labels);
    }
    if (currentRouteIndex === 2) {
      // Preferences — settings section shortcuts
      return pillContentW((['languages', 'genres', 'display', 'account'] as SettingsSection[]).map(s => SECTION_LABELS[s]));
    }
    // Practice — word-bank language filter
    const plCodes  = savedLangCodes;
    const plFull   = plCodes.length <= 4;
    const plOver   = plCodes.length - 4;
    const plLabels = plFull
      ? plCodes.map(c => activeLanguages.find(l => l.code === c)?.nativeName ?? c.toUpperCase())
      : plCodes.slice(0, 4).map(c => c.toUpperCase());
    return pillContentW(['ALL', ...plLabels, ...(plOver > 0 ? [`+${plOver}`] : [])]);
  }

  // ── Toggle handlers ───────────────────────────────────────────────────────

  function toggleLeft() {
    // If audio pill is slotted between the pills, send it back up first
    if (isAudioDocked) { setAudioPillForcedUp(true); }
    if (leftOpen) {
      animCloseLeft();
    } else {
      animToLeftOpen(computeLeftExpandedW());
    }
  }

  function toggleRight() {
    // If audio pill is slotted between the pills, send it back up first
    if (isAudioDocked) { setAudioPillForcedUp(true); }
    if (rightOpen) {
      if (isAudioDocked) {
        animCloseRight();
      } else {
        animToLeftOpen(computeLeftExpandedW());
      }
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
    chipGroupMeasuredW.current = 0;
    if (isAudioDocked) {
      animCloseRight();
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

  // ── Left context content ──────────────────────────────────────────────────

  function renderLeftContext() {
    // Briefing (index 0) — language switcher for brief pages
    if (currentRouteIndex === 0) {
      const showFull = activeLanguages.length <= 4;
      return (
        <View style={styles.contextRow}>
          <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
            {activeLanguages.map((lang, i) => (
              <TouchableOpacity key={lang.code} style={[styles.contextItem, briefPageIndex === i && activeChipStyle]} onPress={() => setBriefPageIndex(i)} activeOpacity={0.7}>
                <Text style={[styles.contextLabel, { color: briefPageIndex === i ? activeColor : inactiveColor, fontFamily: briefPageIndex === i ? fontFamily.bold : fontFamily.regular }]}>
                  {showFull ? lang.nativeName : lang.code.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // Preferences (index 2) — settings section shortcuts
    if (currentRouteIndex === 2) {
      return (
        <View style={styles.contextRow}>
          <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
            {(['languages', 'genres', 'display', 'account'] as SettingsSection[]).map((sec) => (
              <TouchableOpacity key={sec} style={[styles.contextItem, settingsSection === sec && activeChipStyle]} onPress={() => setSettingsSection(sec)} activeOpacity={0.7}>
                <Text style={[styles.contextLabel, { color: settingsSection === sec ? activeColor : inactiveColor, fontFamily: settingsSection === sec ? fontFamily.bold : fontFamily.regular }]}>
                  {SECTION_LABELS[sec]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // Practice — word-bank language filter
    const showFull     = savedLangCodes.length <= 4;
    const visibleLangs = savedLangCodes.slice(0, 4);
    const overflow     = savedLangCodes.length - 4;
    const langLabel    = (code: string) =>
      showFull ? (activeLanguages.find(l => l.code === code)?.nativeName ?? code.toUpperCase()) : code.toUpperCase();
    return (
      <View style={styles.contextRow}>
        <View style={styles.chipGroup} onLayout={e => onChipGroupLayout(e.nativeEvent.layout.width)}>
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

  const leftClosedIcon = 'layers-outline' as const;

  if (gameActive) return null;

  return (
    // Flex-row layout guarantees pills never overlap — spacer fills remaining
    // space and shrinks to 0 before either pill can cross the other.
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}>

      {/* ── Left pill ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { height: leftHeightAnim, width: leftWidthAnim }]}>

        {/* Closed icon */}
        {!leftOpen && (
          <View style={styles.absoluteFill}>
            <TouchableOpacity style={styles.centerFill} onPress={toggleLeft} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
                <Ionicons name={leftClosedIcon} size={20} color={activeColor} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Context chips — outer TouchableOpacity lets tapping any empty area close the pill;
             inner chip TouchableOpacitys capture their own presses (innermost responder wins) */}
        <Animated.View style={[styles.absoluteFill, { opacity: leftContextOp }]} pointerEvents={leftOpen ? 'auto' : 'none'}>
          <TouchableOpacity style={styles.absoluteFill} onPress={toggleLeft} activeOpacity={1}>
            {renderLeftContext()}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Spacer — takes all remaining space, preventing any overlap */}
      <View style={styles.pillSpacer} />

      {/* ── Right pill ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.pill, pillStyle, { height: rightHeightAnim, width: rightWidthAnim }]}>

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
    justifyContent: 'flex-start',
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
    paddingHorizontal: 6,
    paddingVertical: 6,
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
