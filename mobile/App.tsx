import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppAlertHost } from './src/components/AppAlert';
import AppUpdateCheck from './src/components/AppUpdateCheck';
import NotificationWatcher from './src/components/NotificationWatcher';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/state/AuthContext';
import { GameStateProvider } from './src/state/GameStateContext';

export default function App() {
  // The app's typeface (theme `fonts`). Nothing is drawn until it is ready, so text never flashes in the
  // phone's own font first; if it can't be loaded the app still opens, in the system font.
  const [fontsLoaded, fontError] = useFonts({
    'Montserrat-SemiBold': require('./assets/fonts/Montserrat_600SemiBold.ttf'),
    'Montserrat-Bold': require('./assets/fonts/Montserrat_700Bold.ttf'),
    'Montserrat-ExtraBold': require('./assets/fonts/Montserrat_800ExtraBold.ttf'),
    'Montserrat-Black': require('./assets/fonts/Montserrat_900Black.ttf'),
    'Montserrat-ExtraBoldItalic': require('./assets/fonts/Montserrat_800ExtraBold_Italic.ttf'),
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#170709' }} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GameStateProvider>
          <StatusBar hidden />
          <RootNavigator />
          <AppUpdateCheck />
          <NotificationWatcher />
          <AppAlertHost />
        </GameStateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
