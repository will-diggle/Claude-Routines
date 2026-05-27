import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../hooks/useTheme';
import type { BackgroundKey } from '../theme';

// ─── Per-theme RGB values for the gradient fade ───────────────────────────────
const BG_RGB: Record<BackgroundKey, string> = {
  white:     '255, 255, 255',
  cream:     '245, 240, 232',
  softGrey:  '22,  32,  50',
  night:     '20,  20,  20',
};

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  {
    route:    'Preferences',
    label:    'Preferences',
    icon:     'settings'         as const,
    iconOff:  'settings-outline' as const,
  },
  {
    route:    'Briefing',
    label:    'The Brief',
    icon:     'newspaper'         as const,
    iconOff:  'newspaper-outline' as const,
  },
  {
    route:    'Practice',
    label:    'Practice',
    icon:     'school'         as const,
    iconOff:  'school-outline' as const,
  },
];

// ─── Shared geometry — import this wherever screens need bottom padding ────────

export const FLOAT_TAB_H      = 58;   // pill height (compact)
export const FLOAT_TAB_BOTTOM = 16;   // gap from safe-area bottom

// Total vertical space the floating bar occupies (use as paddingBottom in ScrollViews)
export const FLOAT_TAB_INSET  = FLOAT_TAB_H + FLOAT_TAB_BOTTOM + 8;

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, fontFamily, isDark, background } = useTheme();
  const insets = useSafeAreaInsets();

  const pillBg    = isDark ? 'rgba(22,22,22,0.96)' : 'rgba(255,255,255,0.96)';
  const pillBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  const navyPill  = 'rgba(30,45,66,0.97)';
  const isNavy    = background === 'softGrey';

  // Gradient fade — fades content behind the pill area
  const rgb         = BG_RGB[background] ?? BG_RGB.white;
  const fadeHeight  = insets.bottom + FLOAT_TAB_BOTTOM + FLOAT_TAB_H + 110;
  const STEPS       = 14;
  const segH        = fadeHeight / STEPS;

  return (
    <>
      {/* Scrim gradient — transparent at top, opaque at bottom */}
      <View
        pointerEvents="none"
        style={[styles.fadeWrapper, { height: fadeHeight }]}
      >
        {Array.from({ length: STEPS }).map((_, i) => {
          // i=0 at top (transparent), i=STEPS-1 at bottom (fully opaque)
          const alpha = Math.pow(i / (STEPS - 1), 1.6);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: i * segH,
                left: 0,
                right: 0,
                height: segH + 1,
                backgroundColor: `rgba(${rgb}, ${alpha})`,
              }}
            />
          );
        })}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.wrapper, { bottom: insets.bottom + FLOAT_TAB_BOTTOM }]}
      >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: isNavy ? navyPill : pillBg,
            borderColor:     isNavy ? 'rgba(255,255,255,0.10)' : pillBorder,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tab = TABS.find((t) => t.route === route.name) ?? TABS[1];

          const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
          const inactiveColor = isNavy ? 'rgba(245,240,232,0.40)' : colors.inkFaint;
          const tintColor     = isFocused ? activeColor : inactiveColor;

          function handlePress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={handlePress}
              activeOpacity={0.65}
              style={styles.tab}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {/* Active indicator dot — sits above the icon */}
              <View style={[styles.dot, { opacity: isFocused ? 1 : 0, backgroundColor: activeColor }]} />

              <Ionicons
                name={isFocused ? tab.icon : tab.iconOff}
                size={21}
                color={tintColor}
              />
              <Text
                style={[styles.label, { color: tintColor, fontFamily: fontFamily.regular }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full-width transparent container — lets touches fall through to the page
  wrapper: {
    position: 'absolute',
    left: 64,
    right: 64,
    alignItems: 'center',
  },

  // The floating pill
  pill: {
    width: '100%',
    height: FLOAT_TAB_H,
    borderRadius: FLOAT_TAB_H / 2, // stays a perfect pill regardless of height
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
      shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'ios' ? 0.22 : 0,
    shadowRadius: 24,
    elevation: 16,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    gap: 3,
  },

  // Small dot above the icon when tab is active
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 1,
  },

  label: {
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Full-width absolute container for the scrim gradient
  fadeWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
