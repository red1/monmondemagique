import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SoundProvider } from '../contexts/SoundContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ParentalControlProvider } from '../contexts/ParentalControlContext';
import { StoryDownloadProvider } from '../contexts/StoryDownloadContext';
import ParentalLockOverlay from '../src/components/shared/ParentalLockOverlay';
import StoryDownloadBanner from '../src/components/shared/StoryDownloadBanner';
import AppErrorBoundary from '../src/components/shared/AppErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const [fontsLoaded] = useFonts({
    'Fredoka-SemiBold': require('../assets/fonts/Fredoka-SemiBold.ttf'),
  });
  const [skiaReady] = useState(Platform.OS !== 'web');

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && skiaReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, skiaReady]);

  if (!fontsLoaded || !skiaReady) {
    return null;
  }

  return (
    <AppErrorBoundary>
    <SafeAreaProvider>
    <LanguageProvider>
      <SoundProvider>
        <StoryDownloadProvider>
        <ParentalControlProvider>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#00CED1',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontFamily: 'Fredoka-SemiBold',
                fontSize: 24,
              },
              contentStyle: {
                backgroundColor: '#FFF5E1', 
              },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="coloring" options={{ headerShown: false }} />
            <Stack.Screen name="sketch" options={{ headerShown: false }} />
            <Stack.Screen name="library" options={{ headerShown: false }} />
            <Stack.Screen name="math" options={{ headerShown: false }} />
            <Stack.Screen name="logic" options={{ headerShown: false }} />
            <Stack.Screen name="diff" options={{ headerShown: false }} />
            <Stack.Screen name="diff_library" options={{ headerShown: false }} />
                        <Stack.Screen name="hangman" options={{ headerShown: false }} />
<Stack.Screen name="connect4" options={{ headerShown: false }} />
<Stack.Screen name="icon_generator" options={{ headerShown: false }} />
<Stack.Screen name="puzzle" options={{ headerShown: false }} />
            <Stack.Screen name="puzzle_difficulty" options={{ headerShown: false }} />
            <Stack.Screen name="puzzle_game" options={{ headerShown: false }} />
            <Stack.Screen name="stories" options={{ headerShown: false }} />
            <Stack.Screen name="story_packages" options={{ headerShown: false }} />
            <Stack.Screen name="story_player" options={{ headerShown: false }} />
            <Stack.Screen name="videos" options={{ headerShown: false }} />
            <Stack.Screen name="video_player" options={{ headerShown: false }} />
          </Stack>
          <StoryDownloadBanner />
          <ParentalLockOverlay />
        </View>
        </ParentalControlProvider>
        </StoryDownloadProvider>
      </SoundProvider>
    </LanguageProvider>
    </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
