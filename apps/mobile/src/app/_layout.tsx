import '../../global.css';

import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';

import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProviders } from '@/providers/AppProviders';

const CUE_BACKGROUND = '#FAF8F6';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const configureSystemUI = async () => {
      try {
        await SystemUI.setBackgroundColorAsync(CUE_BACKGROUND);
        NavigationBar.setStyle('dark');
      } catch (error) {
        console.warn('Failed to configure system UI:', error);
      }
    };

    configureSystemUI();
  }, []);

  return (
    <SafeAreaProvider>
      <AppProviders>
        <ThemeProvider
          value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
        >
          <StatusBar style="dark" />

          <AnimatedSplashOverlay />

          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: CUE_BACKGROUND,
              },
            }}
          />
        </ThemeProvider>
      </AppProviders>
    </SafeAreaProvider>
  );
}