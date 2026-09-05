import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Avatar, AVATAR_COLOR_OPTIONS, AVATAR_COLOR_PREFIX } from '../components/Avatar';
import { GENRES } from '../constants/genres';
import { MovieSearchResult, searchMovies } from '../services/tmdb';
import { FavoriteMovie, useAuthStore } from '../store/useAuthStore';

const FAVORITE_SLOTS = [0, 1, 2];

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const updateProfile = useAuthStore((s) => s.updateProfile);

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

  const pickColorAvatar = async (hex: string) => {
    setAvatarModalVisible(false);
    await updateProfile({ avatar_url: `${AVATAR_COLOR_PREFIX}${hex}` });
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

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Twój profil</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={() => setAvatarModalVisible(true)}>
          <Avatar url={profile?.avatar_url} size={110} fallbackLetter={profile?.username} />
          <View style={styles.avatarEditBadge}>
            <Text style={styles.avatarEditBadgeText}>Zmień</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.username}>{profile?.username ?? '...'}</Text>

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
              <TouchableOpacity key={slot} style={styles.movieSlot} onPress={() => setMovieSlot(slot)}>
                {movie?.image ? (
                  <Image source={{ uri: movie.image }} style={styles.movieSlotPoster} contentFit="cover" />
                ) : (
                  <Text style={styles.movieSlotText}>+ Dodaj</Text>
                )}
              </TouchableOpacity>
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
              {AVATAR_COLOR_OPTIONS.map((hex) => (
                <TouchableOpacity key={hex} style={[styles.colorSwatch, { backgroundColor: hex }]} onPress={() => pickColorAvatar(hex)} />
              ))}
            </View>
            <TouchableOpacity style={styles.uploadButton} onPress={pickPhotoAvatar} disabled={avatarSaving}>
              {avatarSaving ? <ActivityIndicator color="#26251F" /> : <Text style={styles.uploadButtonText}>Prześlij zdjęcie</Text>}
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
            placeholderTextColor="#B5AFA0"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {loading && <ActivityIndicator color="#E8E4D9" style={{ marginTop: 12 }} />}
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
  container: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#E8E4D9', fontSize: 26 },
  headerTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold' },

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
  avatarEditBadgeText: { color: '#E8E4D9', fontSize: 10, fontWeight: 'bold' },
  username: { color: '#E8E4D9', fontSize: 20, fontWeight: 'bold', marginBottom: 24 },

  sectionTitle: { color: '#B5AFA0', fontSize: 13, fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: 8, marginTop: 8 },
  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%' },
  genreSlot: {
    flex: 1,
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreSlotText: { color: '#E8E4D9', fontSize: 13, fontWeight: 'bold' },
  movieSlot: {
    flex: 1,
    aspectRatio: 2 / 3,
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  movieSlotPoster: { width: '100%', height: '100%' },
  movieSlotText: { color: '#E8E4D9', fontSize: 13, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: '#1E1D18',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    padding: 20,
  },
  modalTitle: { color: '#E8E4D9', fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

  colorRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 18 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 0.5, borderColor: '#B5AFA0' },
  uploadButton: { backgroundColor: '#E8E4D9', borderRadius: 30, paddingVertical: 12, alignItems: 'center' },
  uploadButtonText: { color: '#26251F', fontWeight: 'bold' },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  genreGridTile: {
    width: '48%',
    paddingVertical: 16,
    marginBottom: 10,
    backgroundColor: '#26251F',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreGridTileText: { color: '#E8E4D9', fontSize: 14, fontWeight: 'bold' },

  clearButton: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  clearButtonText: { color: '#E07A5F', fontWeight: 'bold' },

  searchModalCard: { maxHeight: '80%' },
  searchInput: {
    backgroundColor: '#26251F',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E8E4D9',
    fontSize: 15,
  },
  searchResults: { marginTop: 12, maxHeight: 320 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  searchResultPoster: { width: 36, height: 52, borderRadius: 6, marginRight: 10 },
  searchResultPosterPlaceholder: { backgroundColor: '#333' },
  searchResultText: { color: '#E8E4D9', fontSize: 14, flex: 1 },
});
