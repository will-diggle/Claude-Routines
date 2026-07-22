import React from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTabBar } from '../contexts/TabBarContext';
import { useTheme } from '../hooks/useTheme';
import { FlagCircle, GlobeCircle } from './FlagCircle';

export function FlagPill() {
  const { colors } = useTheme();
  const { tabBarAnim } = useTabBar();
  const activeLanguages = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active))
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { bottom: 8 },
        {
          opacity: tabBarAnim,
          transform: [
            { scale: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            { translateY: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: colors.bg + 'E8' }]}>
        {activeLanguages.length === 0 ? (
          <GlobeCircle size={24} />
        ) : (
          activeLanguages.slice(0, 5).map((lang) => (
            <FlagCircle key={lang.code} code={lang.code} size={28} />
          ))
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});
