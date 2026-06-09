import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BriefingScreen } from '../screens/BriefingScreen';
import { PracticeNavigator } from './PracticeNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { FloatingAudioPill } from '../components/FloatingAudioPill';
import { useTheme } from '../hooks/useTheme';

export type RootTabParamList = {
  Briefing: undefined;
  Practice: undefined;
  Preferences: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function AppNavigator() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator
        initialRouteName="Briefing"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          // Every screen manages its own top safe-area inset directly, so no
          // navigation header is needed at all.
          headerShown: false,
        }}
      >
        <Tab.Screen name="Preferences" component={SettingsScreen} />
        <Tab.Screen name="Briefing"    component={BriefingScreen} />
        <Tab.Screen name="Practice"    component={PracticeNavigator} />
      </Tab.Navigator>

      {/* Audio playback pill — floats above the nav pill, visible when playing */}
      <FloatingAudioPill />
    </View>
  );
}
