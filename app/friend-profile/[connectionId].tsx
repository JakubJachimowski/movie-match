import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AvatarZoom } from '../../components/AvatarZoom';
import { GENRES } from '../../constants/genres';
import { supabase } from '../../lib/supabase';
import { FavoriteMovie } from '../../store/useAuthStore';

const AVATAR_BASE_SIZE = 110;
// Dwa sloty na ulubione gatunki (poprzednio trzy) — filmy zostają przy trzech,
// tak samo jak we własnym profilu (app/profile.tsx).
const GENRE_SLOTS = [0, 1];
const MOVIE_SLOTS = [0, 1, 2];

interface FriendProfileRow {
  favorite_genres: number[] | null;
  favorite_movies: FavoriteMovie[] | null;
}

// Profil znajomego — lustrzane odbicie własnego profilu (app/profile.tsx), tylko
// do odczytu: ulubione gatunki i filmy tak, jak je ustawił znajomy. Avatar tutaj
// (nie na ekranie historii przesunięć) po dotknięciu płynnie przesuwa się na
// środek ekranu i rośnie do 90% jego szerokości — dokładnie ta sama animacja
// (współdzielony komponent AvatarZoom) co we własnym profilu.
export default function FriendProfileScreen() {
  const router = useRouter();
  const { connectionId, partnerId, username, avatarUrl } = useLocalSearchParams<{
    connectionId: string;
    partnerId: string;
    username: string;
    avatarUrl?: string;
  }>();

  const [profile, setProfile] = useState<FriendProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('favorite_genres, favorite_movies')
        .eq('id', partnerId)
        .maybeSingle();
      if (!cancelled) {
        if (error) console.warn('fetch friend profile error', error);
        setProfile((data as FriendProfileRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const favoriteGenres = GENRE_SLOTS.map((i) => profile?.favorite_genres?.[i] ?? null);
  const favoriteMovies = MOVIE_SLOTS.map((i) => profile?.favorite_movies?.[i] ?? null);

  const goToHistory = () => {
    router.push({
      pathname: '/friend-history/[connectionId]',
      params: { connectionId, partnerId, username, avatarUrl: avatarUrl ?? '' },
    });
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/background/universal_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={18} color="#ECEEF2" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            onPress={() => router.push('/account')}
          >
            <Ionicons name="settings-outline" size={18} color="#ECEEF2" />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {/* Tytuł wyśrodkowany na ekranie, nad avatarem — tak samo jak we
            własnym profilu, zamiast w wąskim pasku nagłówka. */}
        <Text style={styles.screenTitle}>Profil znajomego</Text>

        <AvatarZoom url={avatarUrl} size={AVATAR_BASE_SIZE} fallbackLetter={username} />
        <Text style={styles.username}>{username ?? '...'}</Text>

        <TouchableOpacity style={styles.historyButton} onPress={goToHistory}>
          <Text style={styles.historyButtonText}>Historia</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#ECEEF2" style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Ulubione gatunki</Text>
            <View style={styles.slotRow}>
              {GENRE_SLOTS.map((slot) => {
                const genre = GENRES.find((g) => g.id === favoriteGenres[slot]);
                return (
                  <View key={slot} style={styles.genreSlot}>
                    <Text style={styles.genreSlotText} numberOfLines={1}>
                      {genre ? genre.name : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Ulubione filmy</Text>
            <View style={styles.slotRow}>
              {MOVIE_SLOTS.map((slot) => {
                const movie = favoriteMovies[slot];
                return (
                  <View key={slot} style={styles.movieSlot}>
                    {movie?.image ? (
                      <Image source={{ uri: movie.image }} style={styles.movieSlotPoster} contentFit="cover" />
                    ) : (
                      <Text style={styles.movieSlotText}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,15,23,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#ECEEF2', fontSize: 26 },
  headerActionsRow: { flexDirection: 'row', gap: 8 },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButtonPressed: { backgroundColor: '#0B0F17' },

  // Odstępy/rozmiary ujednolicone z app/profile.tsx (własny profil) —
  // "profil znajomego" ma wyglądać identycznie pod względem rozłożenia
  // przycisków, tylko z treścią tylko-do-odczytu.
  content: { alignItems: 'center', padding: 24 },
  screenTitle: { color: '#ECEEF2', fontSize: 21, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  username: { color: '#ECEEF2', fontSize: 23, fontWeight: 'bold', marginTop: 10, marginBottom: 24 },

  sectionTitle: { color: '#7C8798', fontSize: 16, fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: 8, marginTop: 8 },
  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%' },
  genreSlot: {
    flex: 1,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreSlotText: { color: '#ECEEF2', fontSize: 16, fontWeight: 'bold' },
  movieSlot: {
    flex: 1,
    aspectRatio: 2 / 3,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  movieSlotPoster: { width: '100%', height: '100%' },
  movieSlotText: { color: '#ECEEF2', fontSize: 16, fontWeight: 'bold' },

  // Szerokość dopasowana do treści (niewiele szerszy niż sam napis), tak samo
  // jak we własnym profilu — zamiast rozciągania na całą szerokość ekranu.
  historyButton: {
    marginTop: 0,
    marginBottom: 24,
    alignSelf: 'center',
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  historyButtonText: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold' },
});
