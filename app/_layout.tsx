import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/useAuthStore';

// Tło natywnego okna (widoczne pod spodem podczas przejść między ekranami) —
// bez tego, na urządzeniach w jasnym motywie systemowym, w trakcie animacji
// przejścia (zwłaszcza cofania) prześwitywała biała warstwa.
SystemUI.setBackgroundColorAsync('#0B0F17');

export const unstable_settings = {
  anchor: '(tabs)',
};

function SplashLoading() {
  return (
    <View style={splashStyles.container}>
      <Image
        source={require('../assets/images/moviematchbackground7.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={splashStyles.overlay} />
      <Text style={splashStyles.title}>MovieMatch</Text>
      <ActivityIndicator color="#ECEEF2" style={{ marginTop: 24 }} />
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
  title: { color: '#ECEEF2', fontSize: 34, fontWeight: 'bold' },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const initializing = useAuthStore((s) => s.initializing);

  if (initializing) {
    return <SplashLoading />;
  }

  const isLoggedIn = !!session;
  const hasProfile = !!profile;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: '#0B0F17' } }}>
          {/* Zalogowany i ma profil — normalna aplikacja. */}
          <Stack.Protected guard={isLoggedIn && hasProfile}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            {/* Dane dopasowań są teraz pobierane z wyprzedzeniem (patrz przycisk
                "Match!'ed"), ale dajemy przejściu nieco więcej czasu niż domyślnie —
                wolniejsza, wyraźna animacja zamiast ewentualnego "urwania" w połowie. */}
            <Stack.Screen
              name="matched"
              options={{ headerShown: false, animation: 'slide_from_right', animationDuration: 480 }}
            />
            <Stack.Screen name="swipe" options={{ headerShown: false }} />
            <Stack.Screen name="account" options={{ headerShown: false }} />
            <Stack.Screen name="connections" options={{ headerShown: false }} />
            <Stack.Screen name="friends" options={{ headerShown: false }} />
            <Stack.Screen name="friend-history/[connectionId]" options={{ headerShown: false }} />
            <Stack.Screen name="friend-profile/[connectionId]" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
          </Stack.Protected>

          {/* Niezalogowany — tylko ekran logowania/rejestracji. */}
          <Stack.Protected guard={!isLoggedIn}>
            <Stack.Screen name="auth" options={{ headerShown: false }} />
          </Stack.Protected>

          {/* Zalogowany, ale bez profilu — dokończenie zakładania konta. */}
          <Stack.Protected guard={isLoggedIn && !hasProfile}>
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
