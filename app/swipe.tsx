import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GenreSettingsModal, COUNTRY_OPTIONS } from '../components/swipe/GenreSettingsModal';
import { MatchPopup } from '../components/swipe/MatchPopup';
import { EmptyMovieCard, MovieCard } from '../components/swipe/MovieCard';
import { useCardSwipeAnimation } from '../hooks/useCardSwipeAnimation';
import { MatchPayload, useMatchRealtime } from '../hooks/useMatchRealtime';
import { useMovieDeck } from '../hooks/useMovieDeck';
import { fetchMovieRuntime, fetchWatchProviders } from '../services/tmdb';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectionsStore } from '../store/useConnectionsStore';
import { useDecisionsStore } from '../store/useDecisionsStore';
import { useMatchNotificationStore } from '../store/useMatchNotificationStore';
import { GenreSettings, useMovieStore } from '../store/useMovieStore';

const MAX_UNDOS_PER_SWIPE = 5;
const EDGE_SPACING = 20;
const TOP_GAP = 14;

export default function Swipe() {
  const { genreId, genreName } = useLocalSearchParams<{ genreId: string; genreName: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const userId = useAuthStore((s) => s.session?.user.id) ?? null;
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const partners = useConnectionsStore((s) => s.partners);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const connectionsLoading = useConnectionsStore((s) => s.loading);

  const getSettingsForGenre = useMovieStore((state) => state.getSettingsForGenre);
  const setSettingsForGenre = useMovieStore((state) => state.setSettingsForGenre);

  const genreIdNum = Number(genreId);
  const [settings, setSettings] = useState<GenreSettings>(() => getSettingsForGenre(genreIdNum));
  const [draftSettings, setDraftSettings] = useState<GenreSettings>(settings);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [areaSize, setAreaSize] = useState<{ width: number; height: number } | null>(null);
  const [undosLeft, setUndosLeft] = useState(0);
  const [runtimeCache, setRuntimeCache] = useState<Record<string, number | null>>({});
  const [providersCache, setProvidersCache] = useState<Record<string, string[] | null>>({});
  const [matchPopup, setMatchPopup] = useState<MatchPayload | null>(null);

  const lastSwipeDirectionRef = useRef<'left' | 'right' | null>(null);
  // Zapamiętuje, kiedy TEN użytkownik ostatnio przesunął dany film w prawo —
  // pozwala odróżnić "ja właśnie dokończyłem/am dopasowanie" (pełny popup) od
  // "to znajomy je dokończył" (samo podświetlenie przycisku Match!).
  const myRecentRightSwipesRef = useRef<Map<string, number>>(new Map());
  const RECENT_SWIPE_WINDOW_MS = 8000;

  const hasUnseenMatch = useMatchNotificationStore((s) => s.hasUnseen(activeConnectionId));
  const markMatchUnseen = useMatchNotificationStore((s) => s.markUnseen);
  const markMatchSeen = useMatchNotificationStore((s) => s.markSeen);

  // Nasłuch w czasie rzeczywistym — dotyczy obojga użytkowników połączenia, ale
  // pełny popup "To dopasowanie!" pokazujemy tylko tej osobie, która właśnie
  // wykonała przesunięcie kończące dopasowanie (czyli była drugą osobą, która
  // polubiła ten film). Druga strona dostaje w tej chwili jedynie pomarańczowe
  // podświetlenie przycisku Match! (docelowo: osobna notyfikacja systemowa).
  useMatchRealtime(activeConnectionId, (match) => {
    const swipedAt = myRecentRightSwipesRef.current.get(match.movie_id);
    const iJustCompletedIt = swipedAt !== undefined && Date.now() - swipedAt < RECENT_SWIPE_WINDOW_MS;

    if (iJustCompletedIt) {
      myRecentRightSwipesRef.current.delete(match.movie_id);
      setMatchPopup(match);
    }
    if (activeConnectionId) markMatchUnseen(activeConnectionId);
  });

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const deck = useMovieDeck({ genreId: genreIdNum, connectionId: activeConnectionId, userId, settings });
  const { currentMovie, loading, noMoviesAvailable } = deck;

  let cardWidth = 0;
  let cardHeight = 0;
  if (areaSize) {
    cardHeight = areaSize.height * 0.9;
    cardWidth = Math.min(cardHeight * (2 / 3), areaSize.width * 0.94);
  }

  const recordSwipe = (direction: 'left' | 'right') => {
    if (!currentMovie || !activeConnectionId || !userId) return;
    if (direction === 'right') {
      myRecentRightSwipesRef.current.set(currentMovie.id, Date.now());
    }
    useDecisionsStore
      .getState()
      .recordDecision(activeConnectionId, userId, currentMovie, direction)
      .catch((e) => console.warn('recordDecision error', e));
    lastSwipeDirectionRef.current = direction;
    deck.advance();
    setUndosLeft(MAX_UNDOS_PER_SWIPE);
  };

  const { cardTranslateX, cardTranslateY, rotateInterpolate, isAnimatingRef, handleGestureEvent, onHandlerStateChange, performSwipe, animateEntrance } =
    useCardSwipeAnimation({
      areaSize,
      cardHeight,
      onSwipeComplete: recordSwipe,
      canSwipe: () => !!currentMovie && !!activeConnectionId && !!userId,
    });

  useEffect(() => {
    if (!currentMovie) return;
    if (runtimeCache[currentMovie.id] !== undefined) return;
    let cancelled = false;
    fetchMovieRuntime(currentMovie.id).then((runtime) => {
      if (!cancelled) {
        setRuntimeCache((prev) => ({ ...prev, [currentMovie.id]: runtime }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentMovie?.id]);

  useEffect(() => {
    if (!currentMovie) return;
    if (providersCache[currentMovie.id] !== undefined) return;
    let cancelled = false;
    fetchWatchProviders(currentMovie.id).then((providers) => {
      if (!cancelled) {
        setProvidersCache((prev) => ({ ...prev, [currentMovie.id]: providers }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentMovie?.id]);

  const handleUndo = () => {
    if (undosLeft <= 0 || isAnimatingRef.current || deck.currentIndex === 0 || !activeConnectionId || !userId) return;
    const dir = lastSwipeDirectionRef.current;
    if (!dir) return;
    isAnimatingRef.current = true;

    useDecisionsStore
      .getState()
      .undoLastDecision(activeConnectionId, userId)
      .catch((e) => console.warn('undoLastDecision error', e));
    deck.goBack();
    setUndosLeft((u) => u - 1);

    animateEntrance(dir);
  };

  const handleWantButton = () => performSwipe('right', 900, 300);
  const handleDontWantButton = () => performSwipe('left', -900, 300);

  const handleMatchButtonPress = () => {
    if (activeConnectionId) markMatchSeen(activeConnectionId);
    router.push('/matched');
  };

  const openSettings = () => {
    setDraftSettings(settings);
    setSettingsVisible(true);
  };

  const applySettings = () => {
    setSettings(draftSettings);
    setSettingsForGenre(genreIdNum, draftSettings);
    setSettingsVisible(false);
    deck.reload(draftSettings);
  };

  const activeCountryLabel = COUNTRY_OPTIONS.find((c) => c.code === settings.country)?.label;
  const filtersSummary = `${settings.scoreMin} – ${settings.scoreMax}  •  ${settings.yearMin} – ${settings.yearMax}${
    settings.country ? `  •  ${activeCountryLabel}` : ''
  }`;

  const runtime = currentMovie ? runtimeCache[currentMovie.id] : undefined;
  const providers = currentMovie ? providersCache[currentMovie.id] : undefined;

  const noActiveConnection = !connectionsLoading && partners.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Image
        source={require('../assets/images/moviematchbackground3.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      <View style={[styles.backRow, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.headerRow, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
        <TouchableOpacity
          style={[styles.headerButton, hasUnseenMatch && styles.headerButtonHighlighted]}
          onPress={handleMatchButtonPress}
        >
          <Text style={styles.headerButtonText}>Match!</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.genreLine} numberOfLines={1}>{genreName}</Text>
          <Text style={styles.filtersLine} numberOfLines={1}>{filtersSummary}</Text>
        </View>

        <TouchableOpacity style={styles.headerButton} onPress={openSettings}>
          <Text style={styles.headerButtonText}>Filtry</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.cardArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAreaSize({ width, height });
        }}
      >
        {noActiveConnection ? (
          <View style={[styles.card, styles.emptyCardOuter, { width: cardWidth, height: cardHeight }]}>
            <Text style={styles.emptyCardText}>
              Nie masz jeszcze aktywnego znajomego do wspólnego oglądania.{'\n\n'}Dodaj kogoś w sekcji „Znajomi", żeby
              zacząć.
            </Text>
          </View>
        ) : (
          <>
            {areaSize && !loading && currentMovie && !noMoviesAvailable && (
              <MovieCard
                movie={currentMovie}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                runtime={runtime}
                providers={providers}
                cardTranslateX={cardTranslateX}
                cardTranslateY={cardTranslateY}
                rotateInterpolate={rotateInterpolate}
                onGestureEvent={handleGestureEvent}
                onHandlerStateChange={onHandlerStateChange}
              />
            )}

            {areaSize && noMoviesAvailable && <EmptyMovieCard cardWidth={cardWidth} cardHeight={cardHeight} />}
          </>
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

      <GenreSettingsModal
        visible={settingsVisible}
        genreName={String(genreName)}
        draftSettings={draftSettings}
        setDraftSettings={setDraftSettings}
        onCancel={() => setSettingsVisible(false)}
        onApply={applySettings}
      />

      <MatchPopup
        visible={!!matchPopup}
        title={matchPopup?.title ?? null}
        year={matchPopup?.year ?? null}
        image={matchPopup?.image ?? null}
        onClose={() => setMatchPopup(null)}
      />
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
    minWidth: 44,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonHighlighted: { backgroundColor: '#E8A33D' },
  headerButtonText: { color: '#E8E4D9', fontSize: 13, fontWeight: 'bold' },

  headerCenter: { flex: 1, marginHorizontal: 8, alignItems: 'center' },
  genreLine: { color: '#E8E4D9', fontSize: 20, fontWeight: 'bold' },
  filtersLine: { color: '#B5AFA0', fontSize: 15, marginTop: 2 },

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
  emptyCardOuter: { padding: 24 },
  emptyCardText: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 22 },

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
});
