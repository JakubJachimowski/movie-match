import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeableStack, SwipeableStackRef } from 'react-native-swipeable-stack';
import { fetchMoviesByGenre } from '../services/tmdb';
import { GenreSettings, Movie, useMovieStore } from '../store/useMovieStore';

const SCORE_RANGE = Array.from({ length: 11 }, (_, i) => i);
const YEAR_RANGE = Array.from({ length: 27 }, (_, i) => 2000 + i);
const COUNTRY_OPTIONS = [
  { code: '', label: 'Dowolny kraj' },
  { code: 'US', label: 'USA' },
  { code: 'IN', label: 'Indie' },
  { code: 'CN', label: 'Chiny' },
  { code: 'JP', label: 'Japonia' },
  { code: 'GB', label: 'Wielka Brytania' },
  { code: 'KR', label: 'Korea Południowa' },
  { code: 'FR', label: 'Francja' },
  { code: 'ES', label: 'Hiszpania' },
  { code: 'DE', label: 'Niemcy' },
  { code: 'IT', label: 'Włochy' },
  { code: 'PL', label: 'Polska' },
];
const MAX_UNDOS_PER_SWIPE = 5;
const EDGE_SPACING = 20;
const TOP_GAP = 14;
const MIN_BUFFER = 5;
const MAX_FETCH_ATTEMPTS = 5;

function CustomSelect({
  label,
  value,
  displayValue,
  options,
  onSelect,
}: {
  label: string;
  value: number | string;
  displayValue: string;
  options: { value: number | string; label: string }[];
  onSelect: (v: any) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={styles.selectBoxText}>{displayValue}</Text>
        <Text style={styles.selectBoxArrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.selectOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.selectList}>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.selectItem, opt.value === value && styles.selectItemActive]}
                  onPress={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.selectItemText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function prefetchPosters(movies: Movie[]) {
  movies.forEach((m) => {
    Image.prefetch(m.image).catch(() => {});
  });
}

export default function Swipe() {
  const { genreId, genreName } = useLocalSearchParams<{ genreId: string; genreName: string }>();
  const stackRef = useRef<SwipeableStackRef>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const swipeRight = useMovieStore((state) => state.swipeRight);
  const swipeLeft = useMovieStore((state) => state.swipeLeft);
  const undoLast = useMovieStore((state) => state.undoLast);
  const getExcludedIds = useMovieStore((state) => state.getExcludedIds);
  const getSettingsForGenre = useMovieStore((state) => state.getSettingsForGenre);
  const setSettingsForGenre = useMovieStore((state) => state.setSettingsForGenre);

  const genreIdNum = Number(genreId);
  const [settings, setSettings] = useState<GenreSettings>(() => getSettingsForGenre(genreIdNum));
  const [draftSettings, setDraftSettings] = useState<GenreSettings>(settings);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [areaSize, setAreaSize] = useState<{ width: number; height: number } | null>(null);
  const [undosLeft, setUndosLeft] = useState(0);
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMovies = async (activeSettings: GenreSettings) => {
    setLoading(true);
    const excluded = getExcludedIds();
    let collected: Movie[] = [];
    let currentPage = 1;
    let pages = 1;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      const { movies: fetched, totalPages: fetchedTotalPages } = await fetchMoviesByGenre(
        genreIdNum,
        currentPage,
        activeSettings
      );
      pages = fetchedTotalPages;
      collected = [...collected, ...fetched.filter((m) => !excluded.has(m.id))];
      if (collected.length >= MIN_BUFFER || currentPage >= pages) break;
      currentPage += 1;
    }

    setMovies(collected);
    prefetchPosters(collected);
    setTotalPages(pages);
    setPage(currentPage);
    setCurrentIndex(0);
    setUndosLeft(0);
    setLoading(false);
  };

  useEffect(() => {
    if (!genreId) return;
    loadMovies(settings);
  }, [genreId]);

  useEffect(() => {
    if (!genreId || loading || fetchingMore) return;
    const remaining = movies.length - currentIndex;
    if (remaining >= MIN_BUFFER || page >= totalPages) return;

    let cancelled = false;
    setFetchingMore(true);

    (async () => {
      const excluded = getExcludedIds();
      let collected: Movie[] = [];
      let currentPage = page;

      for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS && currentPage < totalPages; attempt++) {
        currentPage += 1;
        const { movies: fetched } = await fetchMoviesByGenre(genreIdNum, currentPage, settings);
        collected = [...collected, ...fetched.filter((m) => !excluded.has(m.id))];
        if (collected.length >= MIN_BUFFER) break;
      }

      if (!cancelled) {
        prefetchPosters(collected);
        setMovies((prev) => [...prev, ...collected]);
        setPage(currentPage);
        setFetchingMore(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, movies.length, totalPages, loading]);

  const currentMovie = movies[currentIndex];
  const noMoviesAvailable = !loading && (movies.length === 0 || (currentIndex >= movies.length && page >= totalPages));

  const handleSwipeLeft = (movie: Movie) => {
    swipeLeft(movie);
    setCurrentIndex((i) => i + 1);
    setUndosLeft(MAX_UNDOS_PER_SWIPE);
  };

  const handleSwipeRight = (movie: Movie) => {
    swipeRight(movie);
    setCurrentIndex((i) => i + 1);
    setUndosLeft(MAX_UNDOS_PER_SWIPE);
  };

  const handleUndo = () => {
    if (undosLeft <= 0) return;
    stackRef.current?.undo();
    undoLast();
    setCurrentIndex((i) => Math.max(0, i - 1));
    setUndosLeft((u) => u - 1);
  };

  const handleWantButton = () => {
    if (!currentMovie) return;
    // @ts-ignore
    if (typeof stackRef.current?.swipeRight === 'function') {
      // @ts-ignore
      stackRef.current.swipeRight();
    } else {
      handleSwipeRight(currentMovie);
    }
  };

  const handleDontWantButton = () => {
    if (!currentMovie) return;
    // @ts-ignore
    if (typeof stackRef.current?.swipeLeft === 'function') {
      // @ts-ignore
      stackRef.current.swipeLeft();
    } else {
      handleSwipeLeft(currentMovie);
    }
  };

  const openSettings = () => {
    setDraftSettings(settings);
    setSettingsVisible(true);
  };

  const applySettings = () => {
    setSettings(draftSettings);
    setSettingsForGenre(genreIdNum, draftSettings);
    setSettingsVisible(false);
    loadMovies(draftSettings);
  };

  let cardWidth = 0;
  let cardHeight = 0;
  if (areaSize) {
    cardHeight = areaSize.height * 0.99;
    cardWidth = Math.min(cardHeight * (2 / 3), areaSize.width * 0.94);
  }

  const scoreMinOptions = SCORE_RANGE.filter((v) => v <= draftSettings.scoreMax).map((v) => ({ value: v, label: String(v) }));
  const scoreMaxOptions = SCORE_RANGE.filter((v) => v >= draftSettings.scoreMin).map((v) => ({ value: v, label: String(v) }));
  const yearMinOptions = YEAR_RANGE.filter((v) => v <= draftSettings.yearMax).map((v) => ({ value: v, label: String(v) }));
  const yearMaxOptions = YEAR_RANGE.filter((v) => v >= draftSettings.yearMin).map((v) => ({ value: v, label: String(v) }));
  const countryOptions = COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.label }));
  const countryLabel = COUNTRY_OPTIONS.find((c) => c.code === draftSettings.country)?.label ?? 'Dowolny kraj';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.backRow, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.headerRow, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/matched')}>
          <Text style={styles.headerButtonText}>Match!</Text>
        </TouchableOpacity>

        <Text style={styles.movieTitle} numberOfLines={1}>
          {loading ? 'Ładowanie...' : currentMovie ? `${currentMovie.title} (${currentMovie.year})` : noMoviesAvailable ? 'Brak wyników' : ''}
        </Text>

        <TouchableOpacity style={styles.headerButton} onPress={openSettings}>
          <Text style={styles.headerButtonText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.cardArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAreaSize({ width, height });
        }}
      >
        {areaSize && !loading && movies.length > 0 && !noMoviesAvailable && (
          <SwipeableStack
            key={`${genreId}-${settings.scoreMin}-${settings.scoreMax}-${settings.yearMin}-${settings.yearMax}-${settings.country}`}
            ref={stackRef}
            data={movies}
            keyExtractor={(item) => item.id}
            visibleCards={3}
            renderCard={(movie) => (
              <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
                <Image
                  source={{ uri: movie.image }}
                  style={{ width: cardWidth * 0.875, height: cardHeight * 0.833 }}
                  contentFit="contain"
                  transition={0}
                  cachePolicy="memory-disk"
                />
                <View style={styles.descriptionOverlay}>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.descriptionScrollContent}
                  >
                    <View style={styles.descriptionSpacer} />
                    <Text style={styles.descriptionTitle}>{movie.title}</Text>
                    <Text style={styles.descriptionText}>{movie.description}</Text>
                  </ScrollView>
                </View>
              </View>
            )}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
          />
        )}

        {areaSize && noMoviesAvailable && (
          <View style={[styles.card, styles.emptyCard, { width: cardWidth, height: cardHeight }]}>
            <Text style={styles.emptyCardText}>
              Żaden film nie spełnia wybranych kryteriów.{'\n\n'}Spróbuj poszerzyć zakres w ustawieniach ⚙
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.bottomSlot, { alignItems: 'flex-start' }]}>
          <TouchableOpacity style={styles.sideButton} onPress={handleDontWantButton}>
            <Text style={styles.sideButtonText}>Nie chcę</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSlot, { alignItems: 'center' }]}>
          <TouchableOpacity
            style={[styles.undoButton, undosLeft <= 0 && styles.undoButtonDisabled]}
            onPress={handleUndo}
            disabled={undosLeft <= 0}
          >
            <Text style={styles.undoText}>Cofnij</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSlot, { alignItems: 'flex-end' }]}>
          <TouchableOpacity style={styles.sideButton} onPress={handleWantButton}>
            <Text style={styles.sideButtonText}>Chcę</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={settingsVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ustawienia — {genreName}</Text>

            <ScrollView>
              <CustomSelect
                label="Ocena użytkowników — od"
                value={draftSettings.scoreMin}
                displayValue={String(draftSettings.scoreMin)}
                options={scoreMinOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMin: v }))}
              />

              <CustomSelect
                label="Ocena użytkowników — do"
                value={draftSettings.scoreMax}
                displayValue={String(draftSettings.scoreMax)}
                options={scoreMaxOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMax: v }))}
              />

              <CustomSelect
                label="Rok produkcji — od"
                value={draftSettings.yearMin}
                displayValue={String(draftSettings.yearMin)}
                options={yearMinOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMin: v }))}
              />

              <CustomSelect
                label="Rok produkcji — do"
                value={draftSettings.yearMax}
                displayValue={String(draftSettings.yearMax)}
                options={yearMaxOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMax: v }))}
              />

              <CustomSelect
                label="Kraj produkcji"
                value={draftSettings.country}
                displayValue={countryLabel}
                options={countryOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, country: v }))}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setSettingsVisible(false)}>
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applySettings}>
                <Text style={styles.applyButtonText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },

  backRow: { flexDirection: 'row' },
  backArrow: { color: '#E8E4D9', fontSize: 26 },

  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerButton: {
    backgroundColor: '#333',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { color: '#E8E4D9', fontSize: 13, fontWeight: 'bold' },

  movieTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E8E4D9',
    textAlign: 'center',
    marginHorizontal: 8,
  },

  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  emptyCard: { padding: 24 },
  emptyCardText: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 22 },

  descriptionOverlay: {
    position: 'absolute',
    top: '65%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  descriptionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  descriptionSpacer: { height: 20 },
  descriptionTitle: { color: '#E8E4D9', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  descriptionText: { color: '#E8E4D9', fontSize: 16, lineHeight: 21 },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  bottomSlot: { flex: 1 },
  sideButton: { backgroundColor: '#333', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 30 },
  sideButtonText: { color: '#E8E4D9', fontSize: 14, fontWeight: 'bold' },
  undoButton: { backgroundColor: '#333', width: 65, height: 65, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  undoButtonDisabled: { opacity: 0.35 },
  undoText: { color: '#E8E4D9', fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E1D18', borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  label: { color: '#E8E4D9', fontSize: 14, marginBottom: 4 },

  selectBox: {
    backgroundColor: '#26251F',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectBoxText: { color: '#E8E4D9', fontSize: 15 },
  selectBoxArrow: { color: '#B5AFA0', fontSize: 14 },

  selectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 30 },
  selectList: {
    backgroundColor: '#1E1D18',
    borderRadius: 16,
    maxHeight: '70%',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    overflow: 'hidden',
  },
  selectItem: { paddingVertical: 14, paddingHorizontal: 20 },
  selectItemActive: { backgroundColor: '#333' },
  selectItemText: { color: '#E8E4D9', fontSize: 16 },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  cancelButton: { backgroundColor: '#555', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  cancelButtonText: { color: '#fff', fontWeight: 'bold' },
  applyButton: { backgroundColor: '#4a7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  applyButtonText: { color: '#fff', fontWeight: 'bold' },
});