import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../components/TopBar';
import { BriefingScreen } from '../screens/BriefingScreen';
import { PracticeNavigator } from './PracticeNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useTheme } from '../hooks/useTheme';

export type RootTabParamList = {
  Briefing: undefined;
  Practice: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function AppNavigator() {
  const { colors, fontFamily } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <TopBar />,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accentGold,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarLabelStyle: {
          fontFamily: fontFamily.regular,
          fontSize: 11,
          marginBottom: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          if (route.name === 'Briefing') {
            iconName = focused ? 'newspaper' : 'newspaper-outline';
          } else if (route.name === 'Practice') {
            iconName = focused ? 'school' : 'school-outline';
          } else {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Briefing" component={BriefingScreen} />
      <Tab.Screen name="Practice" component={PracticeNavigator} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
