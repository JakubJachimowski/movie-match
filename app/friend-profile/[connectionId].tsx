import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Avatar, assetSourceFromAvatar, colorFromAvatar, isAssetAvatar, isColorAvatar } from '../../components/Avatar';
import { GENRES } from '../../constants/genres';
import { supabase } from '../../lib/supabase';
import { FavoriteMovie } from '../../store/useAuthStore';

const AVATAR_BASE_SIZE = 110;
const FAVORITE_SLOTS = [0, 1, 2];

interface FriendProfileRow {
  favorite_genres: number[] | null;
  favorite_movies: FavoriteMovie[] | null;
}

// Profil znajomego — lustrzane odbicie własnego profilu (app/profile.tsx), tylko
// do odczytu: ulubione gatunki i filmy tak, jak je ustawił znajomy. Avatar tutaj
// (nie na ekranie historii przesunięć) rozsuwa się po tapnięciu do 3/4 szerokości
// ekranu, wyśrodkowany, górna krawędź zakotwiczona w miejscu startowym.
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

  const favoriteGenres = FAVORITE_SLOTS.map((i) => profile?.favorite_genres?.[i] ?? null);
  const favoriteMovies = FAVORITE_SLOTS.map((i) => profile?.favorite_movies?.[i] ?? null);

  // Powiększanie avatara do 3/4 szerokości ekranu (nie na całą, jak wcześniej
  // na ekranie historii) — ta sama animacja "wzrostu od zakotwiczonej góry".
  const { width: screenWidth } = useWindowDimensions();
  const avatarAnchorRef = useRef<View>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, size: AVATAR_BASE_SIZE });
  const progress = useRef(new Animated.Value(0)).current;

  const targetSize = screenWidth * 0.75;
  const targetX = (screenWidth - targetSize) / 2;

  const overlaySize = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.size, targetSize] });
  const overlayRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.size / 2, targetSize / 2] });
  const overlayLeft = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.x, targetX] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] });

  const toggleAvatarSize = () => {
    if (enlarged) {
      setEnlarged(false);
      Animated.spring(progress, { toValue: 0, friction: 8, useNativeDriver: false }).start(() => {
        setOverlayMounted(false);
      });
    } else {
      avatarAnchorRef.current?.measureInWindow((x, y, width) => {
        setOrigin({ x, y, size: width || AVATAR_BASE_SIZE });
        setOverlayMounted(true);
        setEnlarged(true);
        requestAnimationFrame(() => {
          Animated.spring(progress, { toValue: 1, friction: 8, useNativeDriver: false }).start();
        });
      });
    }
  };

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          Profil znajomego
        </Text>
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
        <TouchableOpacity activeOpacity={1} onPress={toggleAvatarSize}>
          <View ref={avatarAnchorRef} style={overlayMounted ? styles.hiddenAvatar : undefined}>
            <Avatar url={avatarUrl} size={AVATAR_BASE_SIZE} fallbackLetter={username} />
          </View>
        </TouchableOpacity>
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
              {FAVORITE_SLOTS.map((slot) => {
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
              {FAVORITE_SLOTS.map((slot) => {
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

      {overlayMounted && (
        <TouchableOpacity activeOpacity={1} style={styles.enlargeOverlay} onPress={toggleAvatarSize}>
          <Animated.View style={[styles.enlargeBackdrop, { opacity: backdropOpacity }]} />
          <Animated.View
            style={[
              styles.enlargedAvatarFrame,
              {
                top: origin.y,
                left: overlayLeft,
                width: overlaySize,
                height: overlaySize,
                borderRadius: overlayRadius,
              },
            ]}
          >
            {isAssetAvatar(avatarUrl) ? (
              <Image source={assetSourceFromAvatar(avatarUrl as string)} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : isColorAvatar(avatarUrl) ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colorFromAvatar(avatarUrl as string) }]} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.enlargedPlaceholder]}>
                <Text style={styles.enlargedPlaceholderText}>{(username ?? '?').slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </Animated.View>
        </TouchableOpacity>
      )}
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
  headerTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
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
  hiddenAvatar: { opacity: 0 },
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

  historyButton: {
    marginTop: 0,
    marginBottom: 24,
    alignSelf: 'stretch',
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  historyButtonText: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold' },

  enlargeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  enlargeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  enlargedAvatarFrame: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    backgroundColor: '#141A24',
  },
  enlargedPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  enlargedPlaceholderText: { color: '#ECEEF2', fontWeight: 'bold', fontSize: 72 },
});
