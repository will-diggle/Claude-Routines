import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BriefingScreen } from '../screens/BriefingScreen';
import { PracticeNavigator } from './PracticeNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';

export type RootTabParamList = {
  Briefing: undefined;
  Practice: undefined;
  Preferences: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function AppNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Briefing"
      // Custom floating pill — replaces the system tab bar entirely
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        // The floating bar is transparent so we hide the system bar
        tabBarStyle: { display: 'none' },
        headerShown: false,
      }}
    >
      <Tab.Screen name="Preferences" component={SettingsScreen} />
      <Tab.Screen name="Briefing"    component={BriefingScreen} />
      <Tab.Screen name="Practice"    component={PracticeNavigator} />
    </Tab.Navigator>
  );
}
