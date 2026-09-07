import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GenreSettingsModal, COUNTRY_OPTIONS, PROVIDER_OPTIONS } from '../components/swipe/GenreSettingsModal';
import { MatchPopup } from '../components/swipe/MatchPopup';
import { EmptyMovieCard, MovieCard } from '../components/swipe/MovieCard';
import { useCardSwipeAnimation } from '../hooks/useCardSwipeAnimation';
import { MatchPayload, useMatchRealtime } from '../hooks/useMatchRealtime';
import { useMovieDeck } from '../hooks/useMovieDeck';
import { fetchMovieRuntime, fetchWatchProviders, WatchProvider } from '../services/tmdb';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectionsStore } from '../store/useConnectionsStore';
import { useDecisionsStore } from '../store/useDecisionsStore';
import { useMatchesStore } from '../store/useMatchesStore';
import { useMatchNotificationStore } from '../store/useMatchNotificationStore';
import { GenreSettings, Movie, useMovieStore } from '../store/useMovieStore';

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
  const [providersCache, setProvidersCache] = useState<Record<string, WatchProvider[] | null>>({});
  const [matchPopup, setMatchPopup] = useState<MatchPayload | null>(null);
  // Karta widoczna TUŻ PRZED cofnięciem — trzymana osobno, żeby przez czas
  // trwania jej animacji wyjazdu (patrz animateUndoReturn) dało się ją nadal
  // wyrenderować z własnymi (starymi) danymi filmu, mimo że deck.currentMovie
  // już wskazuje na kartę cofniętą.
  const [outgoingMovie, setOutgoingMovie] = useState<Movie | null>(null);

  const lastSwipeDirectionRef = useRef<'left' | 'right' | null>(null);
  // Zapamiętuje, kiedy TEN użytkownik ostatnio przesunął dany film w prawo —
  // pozwala odróżnić "ja właśnie dokończyłem/am dopasowanie" (pełny popup) od
  // "to znajomy je dokończył" (samo podświetlenie przycisku Match!).
  const myRecentRightSwipesRef = useRef<Map<string, number>>(new Map());
  const RECENT_SWIPE_WINDOW_MS = 8000;

  const hasUnseenMatch = useMatchNotificationStore((s) => s.hasUnseen(activeConnectionId));
  const markMatchUnseen = useMatchNotificationStore((s) => s.markUnseen);
  const markMatchSeen = useMatchNotificationStore((s) => s.markSeen);

  // Dopasowania pobierane z wyprzedzeniem w tle, tak samo jak na ekranie
  // głównym — do czasu wciśnięcia "Match!'ed" powinny już być gotowe.
  const matchesReady = useMatchesStore((s) => s.ready && s.connectionId === activeConnectionId);
  const prefetchMatches = useMatchesStore((s) => s.prefetch);
  const [matchNavPending, setMatchNavPending] = useState(false);

  useEffect(() => {
    if (activeConnectionId && userId) {
      prefetchMatches(activeConnectionId, userId);
    }
  }, [activeConnectionId, userId, prefetchMatches]);

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
    cardHeight = areaSize.height * 0.99;
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

  const {
    cardTranslateX,
    cardTranslateY,
    rotateInterpolate,
    tintEnabled,
    isAnimatingRef,
    handleGestureEvent,
    onHandlerStateChange,
    animateEntrance,
    animateUndoReturn,
    leavingCardTranslateX,
    leavingCardTranslateY,
    leavingRotateInterpolate,
    leavingTintEnabled,
    leavingOpacity,
  } = useCardSwipeAnimation({
      areaSize,
      cardHeight,
      onSwipeComplete: recordSwipe,
      canSwipe: () => !!currentMovie && !!activeConnectionId && !!userId,
    });

  // Pierwsza karta w sesji też ma "wjeżdżać" z losowej strony zamiast po
  // prostu pojawić się na środku — jak każda kolejna.
  const firstEntranceDoneRef = useRef(false);
  useEffect(() => {
    if (firstEntranceDoneRef.current || !areaSize || !currentMovie) return;
    firstEntranceDoneRef.current = true;
    animateEntrance(Math.random() < 0.5 ? 'left' : 'right');
  }, [areaSize, currentMovie, animateEntrance]);

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

    // Karta obecnie widoczna ma "wyjechać" (patrz animateUndoReturn) —
    // zapamiętujemy jej dane TERAZ, zanim deck.goBack() przełączy
    // currentMovie na kartę cofaną, żeby dało się ją wyrenderować osobno
    // przez czas trwania tej animacji.
    if (currentMovie) {
      setOutgoingMovie(currentMovie);
    }
    deck.goBack();
    setUndosLeft((u) => u - 1);

    animateUndoReturn(dir, () => setOutgoingMovie(null));
  };

  const handleMatchButtonPress = async () => {
    if (activeConnectionId) markMatchSeen(activeConnectionId);
    if (!matchesReady && activeConnectionId && userId) {
      setMatchNavPending(true);
      await prefetchMatches(activeConnectionId, userId);
      setMatchNavPending(false);
    }
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

  // Podsumowanie filtrów rozbite na osobne wiersze (bez kropek-separatorów) —
  // kraj i platformy VOD to opcjonalne wiersze, wyświetlane tylko gdy ustawione.
  const countryLabels = settings.countries
    .map((code) => COUNTRY_OPTIONS.find((c) => c.code === code)?.label)
    .filter(Boolean);
  const providerLabels = settings.providers
    .map((id) => PROVIDER_OPTIONS.find((p) => p.id === id)?.label)
    .filter(Boolean);

  const summaryLines = [
    `Ocena: ${settings.scoreMin} – ${settings.scoreMax}`,
    `Rok: ${settings.yearMin} – ${settings.yearMax}`,
    countryLabels.length ? `Kraj: ${countryLabels.join(', ')}` : null,
    providerLabels.length ? `VOD: ${providerLabels.join(', ')}` : null,
  ].filter((line): line is string => !!line);

  // Wyrównanie przycisków Match!/Filtry do wiersza z aktualnym filtrem roku:
  // mierzymy pozycję tego wiersza oraz wysokość przycisku, żeby ich środki
  // pokrywały się (patrz onLayout niżej).
  const [yearRowLayout, setYearRowLayout] = useState<{ y: number; height: number } | null>(null);
  const [headerButtonHeight, setHeaderButtonHeight] = useState(0);
  const headerButtonMarginTop =
    yearRowLayout && headerButtonHeight
      ? Math.max(0, yearRowLayout.y + yearRowLayout.height / 2 - headerButtonHeight / 2)
      : 0;

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

      <View style={[styles.backRow, styles.aboveCard, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
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

      <View style={[styles.headerRow, styles.aboveCard, { paddingHorizontal: EDGE_SPACING, marginBottom: TOP_GAP }]}>
        <TouchableOpacity
          style={[styles.headerButton, { marginTop: headerButtonMarginTop }, hasUnseenMatch && styles.headerButtonHighlighted]}
          onPress={handleMatchButtonPress}
          onLayout={(e) => setHeaderButtonHeight(e.nativeEvent.layout.height)}
          disabled={matchNavPending}
        >
          {matchNavPending ? (
            <ActivityIndicator color="#ECEEF2" size="small" />
          ) : (
            <Text style={styles.headerButtonText}>Match!'ed</Text>
          )}
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.genreLine} numberOfLines={1}>{genreName}</Text>
          {summaryLines.map((line, idx) => (
            <Text
              key={line}
              style={styles.filtersLine}
              numberOfLines={1}
              // Wiersz z aktualnym filtrem roku to zawsze drugi wiersz podsumowania
              // (po ocenie) — jego pozycja steruje wyrównaniem przycisków obok.
              onLayout={idx === 1 ? (e) => setYearRowLayout(e.nativeEvent.layout) : undefined}
            >
              {line}
            </Text>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.headerButton, { marginTop: headerButtonMarginTop }]}
          onPress={openSettings}
        >
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
                tintEnabled={tintEnabled}
                onGestureEvent={handleGestureEvent}
                onHandlerStateChange={onHandlerStateChange}
              />
            )}

            {areaSize && noMoviesAvailable && <EmptyMovieCard cardWidth={cardWidth} cardHeight={cardHeight} />}

            {/* Druga, "wyjeżdżająca" warstwa karty — używana przy cofnięciu
                (patrz animateUndoReturn). Renderowana jest PRZEZ CAŁY CZAS
                (nie tylko w trakcie cofania) i nieklikalna — nowe
                zamontowanie widoku (zwłaszcza z obrazkiem plakatu) w samej
                chwili naciśnięcia "Cofnij" kosztowało dodatkową klatkę czy
                dwie, zanim faktycznie coś się na nim wyrenderowało, co
                dawało wrażenie krótkiego mignięcia/zniknięcia karty.
                Trzymając ją cały czas "rozgrzaną" — z obrazkiem tej samej
                karty, którą i tak właśnie widać na głównej karcie — jej
                pojawienie się przy cofnięciu to już tylko zmiana opacity i
                pozycji na istniejącym widoku, bez kosztu ponownego
                montowania. Widoczność (leavingOpacity) jest sterowana
                WYŁĄCZNIE z hooka, wartością Animated (Animated.View), a nie
                stylem przeliczanym przy każdym renderze tego ekranu — patrz
                komentarz przy leavingOpacity w useCardSwipeAnimation.ts. */}
            {areaSize && (outgoingMovie ?? currentMovie) && (
              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Animated.View style={[styles.outgoingCardLayer, { opacity: leavingOpacity }]}>
                  <MovieCard
                    movie={(outgoingMovie ?? currentMovie)!}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    runtime={runtimeCache[(outgoingMovie ?? currentMovie)!.id]}
                    providers={providersCache[(outgoingMovie ?? currentMovie)!.id]}
                    cardTranslateX={leavingCardTranslateX}
                    cardTranslateY={leavingCardTranslateY}
                    rotateInterpolate={leavingRotateInterpolate}
                    tintEnabled={leavingTintEnabled}
                    onGestureEvent={() => {}}
                    onHandlerStateChange={() => {}}
                  />
                </Animated.View>
              </View>
            )}
          </>
        )}
      </View>

      {/* "Nie chcę"/"Chcę" usunięte — wybór filmu odbywa się wyłącznie przez
          przesunięcie karty (gest), Cofnij zostaje jedynym przyciskiem. */}
      <View style={[styles.bottomRow, styles.aboveCard, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.undoButton, undosLeft <= 0 && styles.undoButtonDisabled]}
          onPress={handleUndo}
          disabled={undosLeft <= 0}
        >
          {/* Zawinięta strzałka zamiast napisu "Cofnij" — uniwersalny symbol,
              zrozumiały niezależnie od języka. */}
          <Ionicons name="arrow-undo" size={28} color="#ECEEF2" />
        </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#0B0F17' },

  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backArrow: { color: '#ECEEF2', fontSize: 26 },
  // Przyciski notyfikacji/ustawień — ten sam "chrom" co reszta pigułek w
  // aplikacji, mniejsze niż na ekranie głównym, żeby zmieściły się obok
  // strzałki wstecz bez przeciążania górnego paska.
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

  // Wyrównanie do góry: przyciski Match!/Filtry dostają dynamiczny marginTop,
  // żeby ich tekst wypadał na równi z wierszem podsumowania filtra roku (patrz
  // headerButtonMarginTop w komponencie).
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // Ten sam "chrom" co przyciski na ekranie głównym (Znajomi/Match!'ed), plus 10%
  // większy rozmiar względem poprzedniej wersji tego przycisku (44 -> ~48).
  headerButton: {
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    minWidth: 48,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonHighlighted: { backgroundColor: '#E8A33D', borderColor: '#E8A33D' },
  headerButtonText: { color: '#ECEEF2', fontSize: 14, fontWeight: 'bold' },

  headerCenter: { flex: 1, marginHorizontal: 8, alignItems: 'center' },
  genreLine: { color: '#ECEEF2', fontSize: 20, fontWeight: 'bold' },
  filtersLine: { color: '#7C8798', fontSize: 15, marginTop: 2 },

  // Karta (cardArea) potrafi podczas animacji "wyjechać" poza swój normalny
  // obszar (wjazd zza góry ekranu, wyrzut poniżej dolnej krawędzi) i wizualnie
  // nachodzić na przyciski w innych wierszach. Domyślnie React Native rysuje
  // rodzeństwo w kolejności występowania w JSX, więc wiersze WCZEŚNIEJSZE niż
  // cardArea (strzałka powrotu, Match!'ed/Filtry, notyfikacje/ustawienia)
  // byłyby przez kartę przesłaniane. aboveCard podnosi je nad kartę (bez
  // zmiany ich pozycji w layoucie — zIndex wpływa tylko na kolejność
  // rysowania) — dokładnie tak, jak bottomRow z przyciskiem Cofnij już
  // zachowuje się "za darmo" dzięki temu, że występuje w JSX PO cardArea.
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 0, elevation: 0 },
  aboveCard: { zIndex: 10, elevation: 10 },
  // Wyśrodkowanie karty "wyjeżdżającej" (patrz outgoingMovie) dokładnie w tym
  // samym miejscu co karta główna, mimo że leży w osobnej, bezwzględnie
  // pozycjonowanej warstwie ponad nią.
  outgoingCardLayer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  emptyCardOuter: { padding: 24 },
  emptyCardText: { color: '#ECEEF2', fontSize: 16, textAlign: 'center', lineHeight: 22 },

  bottomRow: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  undoButton: {
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    width: 65,
    height: 65,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonDisabled: { opacity: 0.35 },
});
