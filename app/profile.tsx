import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Avatar, AVATAR_ASSET_OPTIONS } from '../components/Avatar';
import { GENRES } from '../constants/genres';
import { MovieSearchResult, searchMovies } from '../services/tmdb';
import { FavoriteMovie, useAuthStore } from '../store/useAuthStore';
import { useConnectionsStore } from '../store/useConnectionsStore';

const FAVORITE_SLOTS = [0, 1, 2];

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const myId = useAuthStore((s) => s.session?.user.id) ?? null;
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);

  const [favoriteGenres, setFavoriteGenres] = useState<(number | null)[]>([null, null, null]);
  const [favoriteMovies, setFavoriteMovies] = useState<(FavoriteMovie | null)[]>([null, null, null]);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [genreSlot, setGenreSlot] = useState<number | null>(null);
  const [movieSlot, setMovieSlot] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    const genres = [0, 1, 2].map((i) => profile.favorite_genres?.[i] ?? null);
    const movies = [0, 1, 2].map((i) => profile.favorite_movies?.[i] ?? null);
    setFavoriteGenres(genres);
    setFavoriteMovies(movies);
  }, [profile]);

  const persistGenres = async (next: (number | null)[]) => {
    setFavoriteGenres(next);
    await updateProfile({ favorite_genres: next.filter((g): g is number => g !== null) });
  };

  const persistMovies = async (next: (FavoriteMovie | null)[]) => {
    setFavoriteMovies(next);
    await updateProfile({ favorite_movies: next.filter((m): m is FavoriteMovie => m !== null) });
  };

  const pickAssetAvatar = async (value: string) => {
    setAvatarModalVisible(false);
    await updateProfile({ avatar_url: value });
  };

  const pickPhotoAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarSaving(true);
    try {
      const url = await uploadAvatar(result.assets[0].uri);
      await updateProfile({ avatar_url: url });
      setAvatarModalVisible(false);
    } catch (e) {
      console.warn('uploadAvatar error', e);
    } finally {
      setAvatarSaving(false);
    }
  };

  // Historia własnych przesunięć — działa identycznie jak historia znajomego
  // (ten sam ekran, ta sama tabela `decisions`), tylko z user_id ustawionym na
  // mnie zamiast na znajomego.
  const goToHistory = () => {
    router.push({
      pathname: '/friend-history/[connectionId]',
      params: {
        connectionId: activeConnectionId ?? '',
        partnerId: myId ?? '',
        username: profile?.username ?? '',
        avatarUrl: profile?.avatar_url ?? '',
      },
    });
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/background/universal_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Twój profil</Text>
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
        <TouchableOpacity style={styles.avatarWrapper} onPress={() => setAvatarModalVisible(true)}>
          <Avatar url={profile?.avatar_url} size={110} fallbackLetter={profile?.username} />
          <View style={styles.avatarEditBadge}>
            <Text style={styles.avatarEditBadgeText}>Zmień</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.username}>{profile?.username ?? '...'}</Text>

        <TouchableOpacity style={styles.historyButton} onPress={goToHistory}>
          <Text style={styles.historyButtonText}>Historia</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Ulubione gatunki</Text>
        <View style={styles.slotRow}>
          {FAVORITE_SLOTS.map((slot) => {
            const genreId = favoriteGenres[slot];
            const genre = GENRES.find((g) => g.id === genreId);
            return (
              <TouchableOpacity key={slot} style={styles.genreSlot} onPress={() => setGenreSlot(slot)}>
                <Text style={styles.genreSlotText} numberOfLines={1}>
                  {genre ? genre.name : '+ Dodaj'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Ulubione filmy</Text>
        <View style={styles.slotRow}>
          {FAVORITE_SLOTS.map((slot) => {
            const movie = favoriteMovies[slot];
            return (
              <View key={slot} style={styles.movieSlotColumn}>
                <TouchableOpacity style={styles.movieSlot} onPress={() => setMovieSlot(slot)}>
                  {movie?.image ? (
                    <Image source={{ uri: movie.image }} style={styles.movieSlotPoster} contentFit="cover" />
                  ) : (
                    <Text style={styles.movieSlotText}>+ Dodaj</Text>
                  )}
                </TouchableOpacity>
                {movie?.title ? (
                  <Text style={styles.movieSlotTitle} numberOfLines={2}>
                    {movie.title}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* Wybór avatara: 5 kolorowych placeholderów + upload własnego zdjęcia */}
      <Modal visible={avatarModalVisible} transparent animationType="fade" onRequestClose={() => setAvatarModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAvatarModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Wybierz avatar</Text>
            <View style={styles.colorRow}>
              {AVATAR_ASSET_OPTIONS.map((opt) => (
                <TouchableOpacity key={opt.id} style={styles.avatarSwatch} onPress={() => pickAssetAvatar(opt.value)}>
                  <Image source={opt.source} style={styles.avatarSwatchImage} contentFit="cover" />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.uploadButton} onPress={pickPhotoAvatar} disabled={avatarSaving}>
              {avatarSaving ? <ActivityIndicator color="#0B0F17" /> : <Text style={styles.uploadButtonText}>Prześlij zdjęcie</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Wybór ulubionego gatunku dla danego slotu */}
      <Modal visible={genreSlot !== null} transparent animationType="fade" onRequestClose={() => setGenreSlot(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGenreSlot(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Wybierz gatunek</Text>
            <View style={styles.genreGrid}>
              {GENRES.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.genreGridTile}
                  onPress={() => {
                    if (genreSlot === null) return;
                    const next = [...favoriteGenres];
                    next[genreSlot] = g.id;
                    persistGenres(next);
                    setGenreSlot(null);
                  }}
                >
                  <Text style={styles.genreGridTileText}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {genreSlot !== null && favoriteGenres[genreSlot] !== null && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  const next = [...favoriteGenres];
                  next[genreSlot] = null;
                  persistGenres(next);
                  setGenreSlot(null);
                }}
              >
                <Text style={styles.clearButtonText}>Usuń z ulubionych</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Wyszukiwanie ulubionego filmu w TMDB dla danego slotu */}
      <MovieSearchModal
        visible={movieSlot !== null}
        onClose={() => setMovieSlot(null)}
        onSelect={(movie) => {
          if (movieSlot === null) return;
          const next = [...favoriteMovies];
          next[movieSlot] = movie;
          persistMovies(next);
          setMovieSlot(null);
        }}
        onClear={
          movieSlot !== null && favoriteMovies[movieSlot]
            ? () => {
                const next = [...favoriteMovies];
                next[movieSlot!] = null;
                persistMovies(next);
                setMovieSlot(null);
              }
            : undefined
        }
      />
    </View>
  );
}

interface MovieSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (movie: FavoriteMovie) => void;
  onClear?: () => void;
}

function MovieSearchModal({ visible, onClose, onSelect, onClear }: MovieSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(() => {
      searchMovies(query).then((r) => {
        if (!cancelled) {
          setResults(r);
          setLoading(false);
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, styles.searchModalCard]} onPress={() => {}}>
          <Text style={styles.modalTitle}>Szukaj filmu</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Wpisz tytuł..."
            placeholderTextColor="#7C8798"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {loading && <ActivityIndicator color="#ECEEF2" style={{ marginTop: 12 }} />}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            style={styles.searchResults}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultRow}
                onPress={() => onSelect({ id: item.id, title: item.title, image: item.image, year: item.year })}
              >
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.searchResultPoster} contentFit="cover" />
                ) : (
                  <View style={[styles.searchResultPoster, styles.searchResultPosterPlaceholder]} />
                )}
                <Text style={styles.searchResultText} numberOfLines={2}>
                  {item.title}
                  {item.year ? ` (${item.year})` : ''}
                </Text>
              </TouchableOpacity>
            )}
          />
          {onClear && (
            <TouchableOpacity style={styles.clearButton} onPress={onClear}>
              <Text style={styles.clearButtonText}>Usuń z ulubionych</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#ECEEF2', fontSize: 29 },
  headerTitle: { color: '#ECEEF2', fontSize: 21, fontWeight: 'bold', flex: 1, textAlign: 'center' },
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

  content: { alignItems: 'center', padding: 24 },
  avatarWrapper: { marginBottom: 10 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  avatarEditBadgeText: { color: '#ECEEF2', fontSize: 13, fontWeight: 'bold' },
  username: { color: '#ECEEF2', fontSize: 23, fontWeight: 'bold', marginBottom: 24 },

  historyButton: {
    alignSelf: 'stretch',
    marginBottom: 24,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  historyButtonText: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold' },

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
  movieSlotColumn: { flex: 1 },
  movieSlot: {
    width: '100%',
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
  movieSlotTitle: { color: '#ECEEF2', fontSize: 13, textAlign: 'center', marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 20,
  },
  modalTitle: { color: '#ECEEF2', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

  colorRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 18 },
  avatarSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 0.5, borderColor: '#7C8798', overflow: 'hidden' },
  avatarSwatchImage: { width: '100%', height: '100%' },
  uploadButton: { backgroundColor: '#ECEEF2', borderRadius: 30, paddingVertical: 12, alignItems: 'center' },
  uploadButtonText: { color: '#0B0F17', fontWeight: 'bold' },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  genreGridTile: {
    width: '48%',
    paddingVertical: 16,
    marginBottom: 10,
    backgroundColor: '#0B0F17',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreGridTileText: { color: '#ECEEF2', fontSize: 17, fontWeight: 'bold' },

  clearButton: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  clearButtonText: { color: '#E07A5F', fontWeight: 'bold' },

  searchModalCard: { maxHeight: '80%' },
  searchInput: {
    backgroundColor: '#0B0F17',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ECEEF2',
    fontSize: 18,
  },
  searchResults: { marginTop: 12, maxHeight: 320 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  searchResultPoster: { width: 36, height: 52, borderRadius: 6, marginRight: 10 },
  searchResultPosterPlaceholder: { backgroundColor: '#333' },
  searchResultText: { color: '#ECEEF2', fontSize: 17, flex: 1 },
});
