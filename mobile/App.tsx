import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppUpdateCheck from './src/components/AppUpdateCheck';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/state/AuthContext';
import { GameStateProvider } from './src/state/GameStateContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GameStateProvider>
          <StatusBar hidden />
          <RootNavigator />
          <AppUpdateCheck />
        </GameStateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
