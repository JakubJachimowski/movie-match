// WYMAGANE przez Supabase na Expo/React Native — bez tego polyfilla realtime-js
// potrafi błędnie zbudować URL WebSocketu (Hermes ma niepełne wsparcie dla URL),
// przez co subskrypcje Realtime (np. popup/podświetlenie "Match!") milkną bez
// żadnego widocznego błędu, mimo że zwykłe zapytania REST/RPC działają normalnie.
// Musi być pierwszym importem w tym pliku.
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { authStorage } from './authStorage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'Brak EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY w .env — konta i parowanie nie będą działać.'
  );
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Zalecane przez Supabase dla RN: gdy appka jest w tle, przestań odświeżać token
// (oszczędność baterii/sieci), a po powrocie na pierwszy plan odśwież od razu —
// inaczej po dłuższym czasie w tle sesja może wygasnąć niezauważenie, co dodatkowo
// zrywa autoryzację Realtime (subskrypcje wymagają aktualnego tokenu).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
