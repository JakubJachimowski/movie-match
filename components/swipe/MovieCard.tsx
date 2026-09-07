import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { Movie } from '../../store/useMovieStore';
import { WatchProvider } from '../../services/tmdb';
import { StarRating } from '../StarRating';

interface MovieCardProps {
  movie: Movie;
  cardWidth: number;
  cardHeight: number;
  runtime: number | null | undefined;
  providers: WatchProvider[] | null | undefined;
  cardTranslateX: Animated.Value;
  cardTranslateY: Animated.Value;
  rotateInterpolate: Animated.AnimatedInterpolation<string>;
  // 0 podczas animacji "wjazdu" nowej karty, 1 w każdym innym momencie — bez
  // tego tint/stemple migałyby na kolorowo także wtedy, gdy karta po prostu
  // wjeżdża na ekran po przesunięciu poprzedniej (a nie w wyniku decyzji
  // użytkownika o TEJ karcie).
  tintEnabled: Animated.Value;
  onGestureEvent: (event: any) => void;
  onHandlerStateChange: (event: any) => void;
}

// Barwienie karty podczas przeciągania: na czerwono w lewo ("nie chcę"), na
// zielono w prawo ("chcę"), płynnie do maks. 20% krycia.
// Próg dopasowany do tego samego 25% szerokości, przy którym gest kończy się
// realnym swipe'em (patrz useCardSwipeAnimation).
const SWIPE_TINT_MAX_OPACITY = 0.2;
const STAMP_ROTATION_DEG = 22;
const STAMP_CORNER_INSET = 12;
// Nasycone, jednoznacznie czerwony/zielony — poprzednie #E07A5F/#4AA785 (barwy
// z reszty motywu aplikacji) na oko wyglądały jak pomarańcz/morski, nie jak
// klasyczne "źle/dobrze".
const SWIPE_COLOR_LEFT = '#E12D2D';
const SWIPE_COLOR_RIGHT = '#1FAA4C';

// Pole opisu: w wersji zwiniętej wysokość dopasowuje się do treści (tytuł +
// VOD, podtytuł), w rozwiniętej sięga do 60% wysokości karty i dochodzi
// dodatkowo pełny opis filmu w przewijanym polu.
const EXPANDED_HEIGHT_RATIO = 0.6;

// Animacja rozwijania/zwijania opisu — szybka, ale z wyczuwalną bezwładnością:
// najpierw lekkie "zamachnięcie" w złą stronę (antycypacja), potem przejazd z
// przestrzeleniem docelowej wysokości o kilkanaście pikseli, na końcu krótkie
// dociągnięcie z powrotem do właściwego miejsca.
const ANTICIPATE_PX = 6;
const OVERSHOOT_PX = 14;
const ANTICIPATE_DURATION = 70;
const OVERSHOOT_DURATION = 130;
const SETTLE_DURATION = 100;

// Musi być zgodne z marginTop w styles.descriptionScroll — używane też przy
// wyliczaniu naturalnej (dopasowanej do treści) wysokości rozwiniętego pola.
const DESCRIPTION_SCROLL_MARGIN_TOP = 6;

export function MovieCard({
  movie,
  cardWidth,
  cardHeight,
  runtime,
  providers,
  cardTranslateX,
  cardTranslateY,
  rotateInterpolate,
  tintEnabled,
  onGestureEvent,
  onHandlerStateChange,
}: MovieCardProps) {
  const [expanded, setExpanded] = useState(false);
  // Pełny opis (ScrollView) zostaje zamontowany przez cały czas trwania
  // animacji zwijania (nie tylko gdy expanded===true), żeby nie znikał "spod"
  // kurczącego się pola w połowie ruchu.
  const [descriptionMounted, setDescriptionMounted] = useState(false);
  // Naturalna (zmierzona) wysokość zwiniętego pola — punkt odniesienia dla
  // animacji. Zerowana przy każdej zmianie filmu (inny tytuł = inna wysokość
  // nagłówka), żeby zawsze mierzyć od nowa zamiast dziedziczyć po poprzedniku.
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  // Naturalna (zmierzona, nieograniczona) wysokość samego tekstu opisu —
  // pozwala rozwinąć pole dokładnie na tyle, ile trzeba, żeby zmieścić cały
  // opis, zamiast zawsze na sztywne 60% karty.
  const [descriptionTextHeight, setDescriptionTextHeight] = useState<number | null>(null);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const isAnimatingHeightRef = useRef(false);
  const maxExpandedHeight = cardHeight * EXPANDED_HEIGHT_RATIO;
  // Naturalna wysokość po rozwinięciu = nagłówek (identyczny jak zwinięty) +
  // odstęp nad opisem + sam tekst opisu. Dopóki nie zmieści się w limicie
  // (maxExpandedHeight), rozwijamy dokładnie na tyle, ile potrzeba — dopiero
  // dłuższy opis dostaje sztywny limit i przewijanie (suwak z boku).
  const naturalExpandedHeight =
    collapsedHeight !== null && descriptionTextHeight !== null
      ? collapsedHeight + DESCRIPTION_SCROLL_MARGIN_TOP + descriptionTextHeight
      : maxExpandedHeight;
  const expandedHeight = Math.min(naturalExpandedHeight, maxExpandedHeight);
  const descriptionScrollable = naturalExpandedHeight > maxExpandedHeight;

  useEffect(() => {
    setExpanded(false);
    setDescriptionMounted(false);
    setCollapsedHeight(null);
    setDescriptionTextHeight(null);
    isAnimatingHeightRef.current = false;
    heightAnim.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  const handleCollapsedLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    if (collapsedHeight !== null) return;
    const h = e.nativeEvent.layout.height;
    setCollapsedHeight(h);
    heightAnim.setValue(h);
  };

  const toggleExpanded = () => {
    if (collapsedHeight === null || descriptionTextHeight === null || isAnimatingHeightRef.current) return;
    const next = !expanded;
    const start = next ? collapsedHeight : expandedHeight;
    const target = next ? expandedHeight : collapsedHeight;
    const direction = target > start ? 1 : -1;
    const anticipateValue = start - direction * ANTICIPATE_PX;
    const overshootValue = target + direction * OVERSHOOT_PX;

    if (next) setDescriptionMounted(true);
    setExpanded(next);
    isAnimatingHeightRef.current = true;

    Animated.sequence([
      Animated.timing(heightAnim, {
        toValue: anticipateValue,
        duration: ANTICIPATE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(heightAnim, {
        toValue: overshootValue,
        duration: OVERSHOOT_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(heightAnim, {
        toValue: target,
        duration: SETTLE_DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => {
      isAnimatingHeightRef.current = false;
      if (!next) setDescriptionMounted(false);
    });
  };

  const animatedOverlayStyle = collapsedHeight === null ? null : { height: heightAnim };

  // Brak opisu w danych filmu (pusty string/undefined) sprawiał, że mierzony
  // tekst miał wysokość ~0, więc naturalExpandedHeight wypadało prawie
  // identyczne z collapsedHeight — rozwinięcie było wtedy niewidoczne, jakby
  // przycisk "nie działał". Zamiast pustego tekstu zawsze pokazujemy/mierzymy
  // realny, niepusty komunikat.
  const hasDescription = !!movie.description && movie.description.trim().length > 0;
  const displayDescription = hasDescription ? movie.description : 'Brak opisu do pobrania.';

  // Ocena TMDB przeniesiona z tekstowego "(x.x/10)" na dziesięć gwiazdek
  // (patrz StarRating) — w nawiasie zostaje tylko kraj/czas trwania.
  const subtitleParts = [movie.country, runtime ? `${runtime} min` : runtime === null ? null : '...']
    .filter(Boolean)
    .join(' • ');

  const tintThreshold = Math.max(cardWidth * 0.25, 1);
  const leftTintOpacity = Animated.multiply(
    cardTranslateX.interpolate({
      inputRange: [-tintThreshold, 0],
      outputRange: [SWIPE_TINT_MAX_OPACITY, 0],
      extrapolate: 'clamp',
    }),
    tintEnabled
  );
  const rightTintOpacity = Animated.multiply(
    cardTranslateX.interpolate({
      inputRange: [0, tintThreshold],
      outputRange: [0, SWIPE_TINT_MAX_OPACITY],
      extrapolate: 'clamp',
    }),
    tintEnabled
  );
  // Napisy "chcę!"/"nie chcę!" dochodzą do pełnego krycia dokładnie tam, gdzie
  // puszczenie karty zaliczyłoby już swipe'a (ten sam próg co barwienie tła).
  // Tak samo jak tint wyżej — wygaszone przez tintEnabled podczas wjazdu karty.
  const leftStampOpacity = Animated.multiply(
    cardTranslateX.interpolate({
      inputRange: [-tintThreshold, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
    tintEnabled
  );
  const rightStampOpacity = Animated.multiply(
    cardTranslateX.interpolate({
      inputRange: [0, tintThreshold],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    }),
    tintEnabled
  );

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetX={[-10, 10]}
      failOffsetY={[-20, 20]}
    >
      <Animated.View
        style={{
          width: cardWidth,
          height: cardHeight,
          transform: [{ translateX: cardTranslateX }, { translateY: cardTranslateY }, { rotate: rotateInterpolate }],
        }}
      >
        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          <Image
            source={{ uri: movie.image }}
            style={{ width: cardWidth * 0.875, height: cardHeight * 0.833 }}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
          />
          <Animated.View
            style={[styles.descriptionOverlay, animatedOverlayStyle]}
            onLayout={handleCollapsedLayout}
          >
            {/* Tylko nagłówek (tytuł/VOD/gwiazdki/podtytuł) i podpowiedź na dole
                zwijają/rozwijają opis po dotknięciu — pole z pełnym opisem NIE
                jest częścią tego samego przycisku, żeby nieudana próba
                przewinięcia zbyt krótkiego opisu nie była mylnie odczytana jako
                tapnięcie zwijające kartę. */}
            <Pressable onPress={toggleExpanded}>
              <View style={styles.titleRow}>
                <Text style={styles.descriptionTitle} numberOfLines={2}>{movie.title}</Text>
                <ProvidersBadge providers={providers} />
              </View>
              <View style={styles.starsRow}>
                <StarRating rating={movie.voteAverage} size={11} />
              </View>
              <View style={styles.subtitleRow}>
                {subtitleParts ? <Text style={styles.descriptionSubtitle}>({subtitleParts})</Text> : null}
              </View>
            </Pressable>
            {descriptionMounted && (
              <ScrollView
                style={styles.descriptionScroll}
                contentContainerStyle={styles.descriptionScrollContent}
                showsVerticalScrollIndicator={descriptionScrollable}
                indicatorStyle="white"
                persistentScrollbar={descriptionScrollable}
                scrollIndicatorInsets={{ right: 1 }}
                scrollEnabled={descriptionScrollable}
              >
                <Text style={[styles.descriptionText, !hasDescription && styles.descriptionTextEmpty]}>
                  {displayDescription}
                </Text>
              </ScrollView>
            )}
            <Pressable onPress={toggleExpanded}>
              <Text style={styles.expandHint}>{expanded ? '▼ zwiń opis' : '▲ rozwiń opis'}</Text>
            </Pressable>
          </Animated.View>

          {/* Niewidoczna miara pełnego (nieograniczonego) tekstu opisu — do
              wyliczenia, ile faktycznie trzeba miejsca, żeby zmieścić go w
              całości bez przewijania (patrz naturalExpandedHeight wyżej). */}
          {descriptionTextHeight === null && (
            <Text
              style={[
                styles.descriptionText,
                !hasDescription && styles.descriptionTextEmpty,
                styles.hiddenMeasure,
                { width: cardWidth - 32 },
              ]}
              onLayout={(e) => setDescriptionTextHeight(e.nativeEvent.layout.height)}
            >
              {displayDescription}
            </Text>
          )}

          <Animated.View pointerEvents="none" style={[styles.swipeTint, { backgroundColor: SWIPE_COLOR_LEFT, opacity: leftTintOpacity }]} />
          <Animated.View pointerEvents="none" style={[styles.swipeTint, { backgroundColor: SWIPE_COLOR_RIGHT, opacity: rightTintOpacity }]} />

          {/* "Pieczątkowe" napisy w rogu obszaru bez opisu (nie na środku),
              zmieszczone w całości wewnątrz karty (maxWidth liczony z cardWidth,
              overflow:'hidden' na karcie tnie resztę). Czerwony "nie chcę!" w
              prawym górnym rogu (swipe w lewo), zielony "chcę!" w lewym górnym
              rogu (swipe w prawo). */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.stampBadge,
              styles.stampBadgeRight,
              {
                maxWidth: cardWidth * 0.5 - STAMP_CORNER_INSET,
                borderColor: SWIPE_COLOR_LEFT,
                opacity: leftStampOpacity,
                transform: [{ rotate: `${STAMP_ROTATION_DEG}deg` }],
              },
            ]}
          >
            <Text style={[styles.stampText, { color: SWIPE_COLOR_LEFT }]} numberOfLines={1} adjustsFontSizeToFit>
              NIE CHCĘ!
            </Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.stampBadge,
              styles.stampBadgeLeft,
              {
                maxWidth: cardWidth * 0.5 - STAMP_CORNER_INSET,
                borderColor: SWIPE_COLOR_RIGHT,
                opacity: rightStampOpacity,
                transform: [{ rotate: `-${STAMP_ROTATION_DEG}deg` }],
              },
            ]}
          >
            <Text style={[styles.stampText, { color: SWIPE_COLOR_RIGHT }]} numberOfLines={1} adjustsFontSizeToFit>
              CHCĘ!
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
}

// Loga serwisów VOD zamiast tekstowej listy nazw — spójne z GenreSettingsModal
// (te same identyfikatory dostawców TMDB). Brak danych/brak dostępności nadal
// pokazuje krótki tekst.
function ProvidersBadge({ providers }: { providers: WatchProvider[] | null | undefined }) {
  if (providers === undefined) {
    return <Text style={styles.providersText}>...</Text>;
  }
  if (!providers || providers.length === 0) {
    return <Text style={styles.providersText}>Brak w VOD</Text>;
  }
  return (
    <View style={styles.providerLogoRow}>
      {providers.map((p) =>
        p.logoUrl ? (
          <Image key={p.id} source={{ uri: p.logoUrl }} style={styles.providerLogo} contentFit="cover" />
        ) : (
          <Text key={p.id} style={styles.providersText}>{p.name}</Text>
        )
      )}
    </View>
  );
}

interface EmptyCardProps {
  cardWidth: number;
  cardHeight: number;
}

export function EmptyMovieCard({ cardWidth, cardHeight }: EmptyCardProps) {
  return (
    <View style={[styles.card, styles.emptyCard, { width: cardWidth, height: cardHeight }]}>
      <Text style={styles.emptyCardText}>Żaden film nie spełnia wybranych kryteriów.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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

  swipeTint: { ...StyleSheet.absoluteFillObject },

  // Klasyczny "stempel": gruba ramka w kolorze kierunku + wielkie litery w tym
  // samym kolorze, w rogu karty (nie na środku). Rozmiar +15% względem
  // pierwotnej wersji (borderWidth 5->6, padding 8/18->9/21, radius 10->12).
  stampBadge: {
    position: 'absolute',
    borderWidth: 6,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 21,
    backgroundColor: 'rgba(20,26,36,0.35)',
  },
  stampBadgeLeft: { top: STAMP_CORNER_INSET, left: STAMP_CORNER_INSET },
  stampBadgeRight: { top: STAMP_CORNER_INSET, right: STAMP_CORNER_INSET },
  stampText: {
    fontSize: 39,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  emptyCard: { padding: 24 },
  emptyCardText: { color: '#ECEEF2', fontSize: 16, textAlign: 'center', lineHeight: 22 },

  // Zwinięte: pozycjonowane od dołu, wysokość dopasowana do treści (tytuł/VOD +
  // podtytuł, bez opisu). Rozwinięte: jawna wysokość = 60% karty (patrz JSX),
  // dochodzi przewijany opis. Mniej przezroczyste niż poprzednio (0.75 -> 0.9).
  descriptionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  descriptionScroll: { flex: 1, marginTop: DESCRIPTION_SCROLL_MARGIN_TOP },
  descriptionScrollContent: { flexGrow: 1 },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  // Wszystkie czcionki na karcie +2 względem poprzednich wartości.
  descriptionTitle: { color: '#ECEEF2', fontSize: 25, fontWeight: 'bold', flex: 1, marginRight: 8 },
  providersText: { color: '#7C8798', fontSize: 14, textAlign: 'right', maxWidth: '35%' },
  providerLogoRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '40%', gap: 4 },
  providerLogo: { width: 26, height: 26, borderRadius: 6 },

  // Gwiazdki: własny wiersz bezpośrednio pod tytułem (wcześniej dzielone z
  // podtytułem kraj/czas — ten teraz idzie osobno, niżej).
  starsRow: { alignItems: 'flex-start', marginBottom: 4 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
  descriptionSubtitle: { color: '#7C8798', fontSize: 14, marginRight: 8 },
  descriptionText: { color: '#ECEEF2', fontSize: 19, lineHeight: 23 },
  // Zastępczy komunikat, gdy film nie ma opisu w danych — odróżniony od
  // prawdziwego opisu (przygaszony, kursywa), żeby było jasne, że to informacja
  // systemowa, a nie treść filmu.
  descriptionTextEmpty: { color: '#7C8798', fontStyle: 'italic' },
  // Niewidoczna kopia do pomiaru naturalnej wysokości pełnego opisu — poza
  // ekranem, ale z realną (nieskończoną) wysokością, żeby onLayout zwrócił
  // prawdziwy rozmiar potrzebny na cały tekst.
  hiddenMeasure: { position: 'absolute', top: -4000, left: 0, opacity: 0 },
  // Podpowiedź zwiń/rozwiń: +50% względem pierwotnego rozmiaru (11 -> ~17).
  expandHint: { color: '#7C8798', fontSize: 17, textAlign: 'center', marginTop: 6 },
});
