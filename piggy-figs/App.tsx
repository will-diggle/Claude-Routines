import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HomeScreen } from './src/screens/HomeScreen';
import { AddAppScreen } from './src/screens/AddAppScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import type { Connection } from './src/lib/connections';
import { useTheme, FONT_SERIF } from './src/theme/tokens';

export type RootStackParamList = {
  Home: undefined;
  AddApp: undefined;
  Dashboard: { connection: Connection };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const { name, colors } = useTheme();
  const isDark = name === 'night';

  return (
    <NavigationContainer theme={{
      dark: isDark,
      colors: {
        primary: colors.chrome, background: colors.bg, card: colors.card,
        text: colors.ink, border: colors.border, notification: colors.accentRed,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' },
        medium: { fontFamily: 'System', fontWeight: '500' },
        bold: { fontFamily: 'System', fontWeight: '700' },
        heavy: { fontFamily: 'System', fontWeight: '800' },
      },
    }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: FONT_SERIF, fontWeight: '700' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddApp" component={AddAppScreen} options={{ title: 'Add app', presentation: 'modal' }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
