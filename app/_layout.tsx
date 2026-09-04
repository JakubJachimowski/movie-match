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
SystemUI.setBackgroundColorAsync('#26251F');

export const unstable_settings = {
  anchor: '(tabs)',
};

function SplashLoading() {
  return (
    <View style={splashStyles.container}>
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={splashStyles.overlay} />
      <Text style={splashStyles.title}>MovieMatch</Text>
      <ActivityIndicator color="#E8E4D9" style={{ marginTop: 24 }} />
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  title: { color: '#E8E4D9', fontSize: 34, fontWeight: 'bold' },
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
        <Stack screenOptions={{ contentStyle: { backgroundColor: '#26251F' } }}>
          {/* Zalogowany i ma profil — normalna aplikacja. */}
          <Stack.Protected guard={isLoggedIn && hasProfile}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="matched" options={{ title: 'Wspólnie polubione' }} />
            <Stack.Screen name="swipe" options={{ headerShown: false }} />
            <Stack.Screen name="account" options={{ headerShown: false }} />
            <Stack.Screen name="connections" options={{ headerShown: false }} />
            <Stack.Screen name="friends" options={{ headerShown: false }} />
            <Stack.Screen name="friend-history/[connectionId]" options={{ headerShown: false }} />
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
