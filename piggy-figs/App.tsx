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

export type RootStackParamList = {
  Home: undefined;
  AddApp: undefined;
  Dashboard: { connection: Connection };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={{
          dark: true,
          colors: {
            primary: '#3987e5', background: '#0d0d0d', card: '#1a1a19',
            text: '#ffffff', border: 'rgba(255,255,255,0.1)', notification: '#d03b3b',
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '800' },
          },
        }}>
          <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0d0d0d' }, headerTintColor: '#fff' }}>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddApp" component={AddAppScreen} options={{ title: 'Add app', presentation: 'modal' }} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
