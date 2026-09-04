import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useShallow } from 'zustand/react/shallow';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore, langDisplayCode } from '../store/useSettingsStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';
import { useWordBankStore } from '../store/useWordBankStore';
import { FlagCircle, GlobeCircle } from './FlagCircle';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { IPAD_SIDEBAR_W } from './FloatingTabBar';

// Persistent left sidebar shown in place of the bottom floating pill bar on
// iPad — a proper full-height nav column instead of a phone-idiom pill you
// have to reach for at the bottom of a 13" screen. Mirrors the pill's exact
// route/context behaviour (same store writes, same "tap active tab = no-op"
// rule) so switching between phone and iPad doesn't change what taps do.

const TABS: { route: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; iconOff: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { route: 'Preferences', label: 'Preferences', icon: 'options',   iconOff: 'options-outline' },
  { route: 'Briefing',    label: 'The Brief',    icon: 'newspaper', iconOff: 'newspaper-outline' },
  { route: 'Practice',    label: 'Practice',     icon: 'school',   iconOff: 'school-outline' },
];

const SETTINGS_SECTIONS: { key: SettingsSection; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; iconFilled: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'languages', label: 'Languages', icon: 'globe-outline',         iconFilled: 'globe' },
  { key: 'genres',    label: 'Genres',    icon: 'pricetags-outline',     iconFilled: 'pricetags' },
  { key: 'display',   label: 'Display',   icon: 'color-palette-outline', iconFilled: 'color-palette' },
  { key: 'profile',   label: 'Profile',   icon: 'person-outline',        iconFilled: 'person' },
];

type IPadSidebarProps = Pick<BottomTabBarProps, 'state' | 'navigation'>;

export function IPadSidebar({ state, navigation }: IPadSidebarProps) {
  const { colors, fontFamily, isDark, background } = useTheme();
  const insets = useSafeAreaInsets();

  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active)));
  const savedWords = useWordBankStore(useShallow((s) => s.words));
  const savedLangCodes = useMemo(
    () => [...new Set(savedWords.map((w) => w.language))].sort(),
    [savedWords],
  );

  const {
    briefPageIndex, setBriefPageIndex,
    settingsSection, setSettingsSection,
    practiceLang, setPracticeLang,
  } = useNavPillStore(useShallow((s) => ({
    briefPageIndex: s.briefPageIndex, setBriefPageIndex: s.setBriefPageIndex,
    settingsSection: s.settingsSection, setSettingsSection: s.setSettingsSection,
    practiceLang: s.practiceLang, setPracticeLang: s.setPracticeLang,
  })));

  const isNavy = background === 'softGrey';
  const activeColor   = isNavy ? '#F5F0E8' : colors.inkDark;
  const inactiveColor = isNavy ? 'rgba(245,240,232,0.45)' : colors.inkFaint;
  const activeBg = isNavy ? 'rgba(245,240,232,0.13)' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  const currentRouteName = state.routes[state.index].name;

  function go(routeName: string) {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const isFocused = currentRouteName === routeName;
    Haptics.selectionAsync();
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  }

  return (
    <View style={[styles.wrapper, { width: IPAD_SIDEBAR_W }]}>
      {glassAvailable ? (
        <GlassSurface style={StyleSheet.absoluteFillObject} cornerRadius={0} colorScheme={isDark ? 'dark' : 'light'} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card }]} />
      )}
      <View style={[styles.borderEdge, { backgroundColor: colors.borderLight }]} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.brand, { color: activeColor, fontFamily: fontFamily.bold }]}>Bilinguist Brief</Text>

        <View style={styles.navGroup}>
          {TABS.map((tab) => {
            const isFocused = currentRouteName === tab.route;
            return (
              <TouchableOpacity
                key={tab.route}
                style={[styles.navRow, isFocused && { backgroundColor: activeBg }]}
                onPress={() => go(tab.route)}
                activeOpacity={0.7}
              >
                <Ionicons name={isFocused ? tab.icon : tab.iconOff} size={22} color={isFocused ? activeColor : inactiveColor} style={styles.navIcon} />
                <Text style={[styles.navLabel, { color: isFocused ? activeColor : inactiveColor, fontFamily: isFocused ? fontFamily.bold : fontFamily.regular }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {currentRouteName === 'Briefing' && activeLanguages.length > 0 && (
          <View style={styles.subGroup}>
            <Text style={[styles.subHeader, { color: inactiveColor, fontFamily: fontFamily.regular }]}>EDITIONS</Text>
            {activeLanguages.map((lang, i) => {
              const isActive = i === briefPageIndex;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.subRow, isActive && { backgroundColor: activeBg }]}
                  onPress={() => { Haptics.selectionAsync(); setBriefPageIndex(i); }}
                  activeOpacity={0.7}
                >
                  <FlagCircle code={lang.code} size={20} />
                  <Text style={[styles.subLabel, { color: isActive ? activeColor : inactiveColor, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]} numberOfLines={1}>
                    {lang.nativeName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {currentRouteName === 'Preferences' && (
          <View style={styles.subGroup}>
            <Text style={[styles.subHeader, { color: inactiveColor, fontFamily: fontFamily.regular }]}>SECTIONS</Text>
            {SETTINGS_SECTIONS.map((sec) => {
              const isActive = settingsSection === sec.key;
              return (
                <TouchableOpacity
                  key={sec.key}
                  style={[styles.subRow, isActive && { backgroundColor: activeBg }]}
                  onPress={() => { Haptics.selectionAsync(); setSettingsSection(sec.key); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={isActive ? sec.iconFilled : sec.icon} size={18} color={isActive ? activeColor : inactiveColor} />
                  <Text style={[styles.subLabel, { color: isActive ? activeColor : inactiveColor, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]}>
                    {sec.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {currentRouteName === 'Practice' && savedLangCodes.length > 0 && (
          <View style={styles.subGroup}>
            <Text style={[styles.subHeader, { color: inactiveColor, fontFamily: fontFamily.regular }]}>FILTER</Text>
            <TouchableOpacity
              style={[styles.subRow, practiceLang === 'all' && { backgroundColor: activeBg }]}
              onPress={() => { Haptics.selectionAsync(); setPracticeLang('all'); }}
              activeOpacity={0.7}
            >
              <GlobeCircle size={20} />
              <Text style={[styles.subLabel, { color: practiceLang === 'all' ? activeColor : inactiveColor, fontFamily: practiceLang === 'all' ? fontFamily.bold : fontFamily.regular }]}>
                All languages
              </Text>
            </TouchableOpacity>
            {savedLangCodes.map((code) => {
              const isActive = practiceLang === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.subRow, isActive && { backgroundColor: activeBg }]}
                  onPress={() => { Haptics.selectionAsync(); setPracticeLang(code); }}
                  activeOpacity={0.7}
                >
                  <FlagCircle code={code} size={20} />
                  <Text style={[styles.subLabel, { color: isActive ? activeColor : inactiveColor, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]}>
                    {langDisplayCode(code)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 50,
    elevation: 50,
  },
  borderEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  brand: {
    fontSize: 15,
    letterSpacing: 0.2,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  navGroup: {
    paddingHorizontal: 12,
    gap: 2,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  navIcon: {
    width: 26,
  },
  navLabel: {
    fontSize: 16,
    marginLeft: 6,
  },
  subGroup: {
    marginTop: 22,
    paddingHorizontal: 12,
    gap: 1,
  },
  subHeader: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    gap: 10,
  },
  subLabel: {
    fontSize: 14,
    flexShrink: 1,
  },
});
