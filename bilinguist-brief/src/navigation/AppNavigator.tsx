import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BriefingScreen } from '../screens/BriefingScreen';
import { PracticeNavigator } from './PracticeNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { TopBar } from '../components/TopBar';

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
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        // Briefing has its own full masthead inside the ScrollView so the
        // nav header is hidden. Settings and Practice use the compact TopBar
        // which correctly applies insets.top safe-area padding at the top.
        headerShown: route.name !== 'Briefing',
        header: () => <TopBar routeName={route.name} />,
      })}
    >
      <Tab.Screen name="Preferences" component={SettingsScreen} />
      <Tab.Screen name="Briefing"    component={BriefingScreen} />
      <Tab.Screen name="Practice"    component={PracticeNavigator} />
    </Tab.Navigator>
  );
}
