import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
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

// Muszą być zgodne z odpowiadającymi im wartościami w styles.descriptionOverlay
// (paddingTop/paddingBottom) — używane do wyliczenia wysokości zwiniętego pola
// (patrz collapsedHeight w komponencie).
const OVERLAY_PADDING_TOP = 12;
const OVERLAY_PADDING_BOTTOM = 10;
// Podpowiedź "rozwiń/zwiń opis" jest teraz OSOBNYM, nieanimowanym paskiem pod
// polem opisu (nie porusza się razem z jego animacją wysokości). Wysokość
// paska jest STAŁA (nie mierzona przez onLayout) — tekst podpowiedzi jest
// zawsze jednowierszowy o znanym, niezmiennym rozmiarze czcionki, więc nie ma
// potrzeby dynamicznego pomiaru. Stała wysokość eliminuje ryzyko chwilowego
// (lub błędnego) nakładania się paska na dolną część nagłówka, zanim
// asynchroniczny pomiar zdążyłby się ustabilizować.
const HINT_BAR_HEIGHT = 42;
// Powiększony hitbox przycisku podpowiedzi w osi pionowej (bez zmiany
// wyglądu) — łatwiej trafić, zwłaszcza że pasek jest teraz cienki.
const HINT_HIT_SLOP = 8;

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
          {/* key={movie.id}: wymusza PEŁNY remount tego pod-drzewa przy każdej
              zmianie filmu, żeby stan pomiarów (headerHeight/descriptionTextHeight
              itd.) zawsze zaczynał od czystego, świeżego stanu początkowego —
              bez ręcznego zerowania przez efekt, które potrafiło "wygrać wyścig"
              z asynchronicznym onLayout i trwale zablokować rozwijanie opisu
              (measured height ustawiony przez onLayout bywał zaraz potem
              nadpisywany z powrotem na null przez efekt reagujący na movie.id). */}
          <DescriptionOverlay
            key={movie.id}
            movie={movie}
            providers={providers}
            runtime={runtime}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />

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

interface DescriptionOverlayProps {
  movie: Movie;
  providers: WatchProvider[] | null | undefined;
  runtime: number | null | undefined;
  cardWidth: number;
  cardHeight: number;
}

// Nagłówek (tytuł/VOD/gwiazdki/podtytuł) + rozwijany pełny opis + osobny,
// nieruchomy pasek z podpowiedzią zwiń/rozwiń. Wydzielone z MovieCard i
// montowane TAM z key={movie.id}, żeby przy zmianie filmu React w pełni
// resetował stan pomiarów (headerHeight/descriptionTextHeight) sam, bez
// ręcznego efektu — ręczny reset na movie.id potrafił "wygrać wyścig" z
// asynchronicznym onLayout (który ustawiał zmierzoną wysokość PO tym, jak
// efekt już ją wyzerował), trwale blokując rozwijanie opisu.
function DescriptionOverlay({ movie, providers, runtime, cardWidth, cardHeight }: DescriptionOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  // Pełny opis (ScrollView) zostaje zamontowany przez cały czas trwania
  // animacji zwijania (nie tylko gdy expanded===true), żeby nie znikał "spod"
  // kurczącego się pola w połowie ruchu.
  const [descriptionMounted, setDescriptionMounted] = useState(false);
  // Naturalna (zmierzona) wysokość nagłówka — element bez flex zawsze
  // raportuje w onLayout swój naturalny rozmiar, niezależnie od tego, czy
  // rodzic (animowana nakładka) ma jawnie ustawioną, mniejszą wysokość z
  // overflow:hidden. Dzięki temu nadążamy za zmianami treści nagłówka (np.
  // dane VOD/kraj/czas dochodzące z opóźnieniem).
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  // Wysokość zwiniętego pola opisu = TYLKO nagłówek + jego padding — podpowiedź
  // nie jest częścią tej (animowanej) nakładki, więc nie wchodzi do jej
  // budżetu wysokości (patrz HINT_BAR_HEIGHT, osobny nieanimowany pasek o
  // stałej wysokości).
  const collapsedHeight = headerHeight !== null ? OVERLAY_PADDING_TOP + headerHeight + OVERLAY_PADDING_BOTTOM : null;
  // Naturalna (zmierzona, nieograniczona) wysokość samego tekstu opisu —
  // pozwala rozwinąć pole dokładnie na tyle, ile trzeba, żeby zmieścić cały
  // opis, zamiast zawsze na sztywne 60% karty.
  const [descriptionTextHeight, setDescriptionTextHeight] = useState<number | null>(null);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const isAnimatingHeightRef = useRef(false);
  // Własny, dyskretny pasek przewijania opisu (zamiast natywnego, który na
  // Androidzie domyślnie zanika poza momentem przewijania) — viewport/content
  // height mierzone na bieżąco, pozycja kciuka liczona z aktualnego scrollY.
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const handleDescriptionScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
  ).current;
  // Limit wysokości SAMEJ animowanej nakładki (bez paska podpowiedzi, który
  // stoi pod nią jako osobny, stały element o znanej z góry wysokości) —
  // łączny widoczny obszar (nakładka + pasek) i tak nie przekroczy z grubsza
  // 60% wysokości karty.
  const maxExpandedHeight = Math.max(0, cardHeight * EXPANDED_HEIGHT_RATIO - HINT_BAR_HEIGHT);
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

  const handleHeaderLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = Math.round(e.nativeEvent.layout.height);
    // Tolerancja 1px: sam pomiar potrafi "drgać" o pojedynczy piksel między
    // kolejnymi przebiegami layoutu (subpikselowe zaokrąglenia przy skalowaniu
    // gęstości ekranu) — bez tolerancji każde drgnięcie aktualizowało stan,
    // co zmieniało collapsedHeight, co przez heightAnim zmieniało wysokość
    // nakładki, co znów lekko przestawiało pomiar nagłówka — w kółko, w
    // nieskończoność (widoczne jako czysto "70, 71, 70, 71..." zalewające
    // konsolę). Różnica ≤1px jest wizualnie niezauważalna, więc ją ignorujemy.
    setHeaderHeight((prev) => (prev !== null && Math.abs(prev - h) <= 1 ? prev : h));
  };

  // Utrzymuje wysokość nakładki zsynchronizowaną z aktualnie potrzebną wartością
  // (zwiniętą lub rozwiniętą), gdy TA wartość się zmienia z przyczyn innych niż
  // sama animacja zwijania/rozwijania (np. dotarły dane VOD/kraj/czas i
  // collapsedHeight urósł) — bez animacji, to tylko korekta, nie gest użytkownika.
  useEffect(() => {
    if (isAnimatingHeightRef.current || collapsedHeight === null) return;
    heightAnim.setValue(expanded ? expandedHeight : collapsedHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedHeight, expandedHeight, expanded]);

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

  // Rozmiar i pozycja kciuka własnego paska przewijania — proporcja widocznego
  // do całkowitego, a przesunięcie liczone bezpośrednio z żywego scrollY (bez
  // dodatkowego stanu), więc porusza się płynnie razem z przewijaniem.
  const MIN_THUMB_HEIGHT = 24;
  const thumbHeight =
    scrollContentHeight > 0
      ? Math.min(scrollViewportHeight, Math.max(MIN_THUMB_HEIGHT, (scrollViewportHeight / scrollContentHeight) * scrollViewportHeight))
      : scrollViewportHeight;
  const scrollRange = Math.max(1, scrollContentHeight - scrollViewportHeight);
  const thumbTranslateY = scrollY.interpolate({
    inputRange: [0, scrollRange],
    outputRange: [0, Math.max(0, scrollViewportHeight - thumbHeight)],
    extrapolate: 'clamp',
  });

  // Ocena TMDB przeniesiona z tekstowego "(x.x/10)" na dziesięć gwiazdek
  // (patrz StarRating) — w nawiasie zostaje tylko kraj/czas trwania.
  const subtitleParts = [movie.country, runtime ? `${runtime} min` : runtime === null ? null : '...']
    .filter(Boolean)
    .join(' • ');

  return (
    <>
      <Animated.View style={[styles.descriptionOverlay, { bottom: HINT_BAR_HEIGHT }, animatedOverlayStyle]}>
        {/* Tylko nagłówek (tytuł/VOD/gwiazdki/podtytuł) zwija/rozwija opis po
            dotknięciu — pole z pełnym opisem NIE jest częścią tego samego
            przycisku, żeby nieudana próba przewinięcia zbyt krótkiego opisu
            nie była mylnie odczytana jako tapnięcie zwijające kartę. Sam
            napis zwiń/rozwiń stoi w OSOBNYM, nieanimowanym pasku pod tą
            nakładką (patrz styles.hintBar niżej) — dzięki temu jest
            całkowicie nieruchomy przez cały czas animacji rozwijania. */}
        <Pressable onPress={toggleExpanded} onLayout={handleHeaderLayout}>
          <View style={styles.titleRow}>
            <Text style={styles.descriptionTitle} numberOfLines={2}>{movie.title}</Text>
            <ProvidersBadge providers={providers} />
          </View>
          <View style={styles.starsRow}>
            <StarRating rating={movie.voteAverage} size={14} />
          </View>
          <View style={styles.subtitleRow}>
            {subtitleParts ? <Text style={styles.descriptionSubtitle}>({subtitleParts})</Text> : null}
          </View>
        </Pressable>
        {descriptionMounted && (
          <View style={styles.descriptionScrollWrap}>
            <Animated.ScrollView
              style={styles.descriptionScroll}
              contentContainerStyle={styles.descriptionScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled={descriptionScrollable}
              onLayout={(e) => setScrollViewportHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_w, h) => setScrollContentHeight(h)}
              onScroll={handleDescriptionScroll}
              scrollEventThrottle={16}
            >
              <Text style={[styles.descriptionText, !hasDescription && styles.descriptionTextEmpty]}>
                {displayDescription}
              </Text>
            </Animated.ScrollView>
            {/* Dyskretny, zawsze widoczny (nie zanikający jak natywny) pasek
                przewijania — pojawia się tylko, gdy opis faktycznie nie mieści
                się w całości w rozwiniętym polu. */}
            {descriptionScrollable && scrollContentHeight > scrollViewportHeight && scrollViewportHeight > 0 && (
              <View pointerEvents="none" style={styles.scrollTrack}>
                <Animated.View
                  style={[
                    styles.scrollThumb,
                    {
                      height: thumbHeight,
                      transform: [{ translateY: thumbTranslateY }],
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}
      </Animated.View>
      {/* Pasek z podpowiedzią "rozwiń/zwiń opis" — osobny, NIEANIMOWANY
          element stojący na stałe u dołu karty (poza animowaną nakładką
          powyżej), więc nigdy nie przesuwa się razem z jej animacją
          wysokości. hitSlop powiększa hitbox w pionie bez zmiany wyglądu. */}
      <Pressable
        onPress={toggleExpanded}
        hitSlop={{ top: HINT_HIT_SLOP, bottom: HINT_HIT_SLOP }}
        style={styles.hintBar}
      >
        <Text style={styles.expandHint}>{expanded ? '▼ zwiń opis' : '▲ rozwiń opis'}</Text>
      </Pressable>

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
    </>
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
  // Wiersz zawierający ScrollView z opisem + własny, dyskretny pasek przewijania
  // obok niego (nie na nim) — stąd flexDirection:'row'.
  descriptionScrollWrap: { flex: 1, flexDirection: 'row', marginTop: DESCRIPTION_SCROLL_MARGIN_TOP },
  descriptionScroll: { flex: 1 },
  descriptionScrollContent: { flexGrow: 1 },
  // Tor i kciuk własnego paska przewijania — cienki, przygaszony, zawsze
  // widoczny (dopóki opis się nie mieści), w przeciwieństwie do domyślnego
  // natywnego wskaźnika, który na Androidzie zanika poza chwilą przewijania.
  scrollTrack: {
    width: 3,
    marginLeft: 8,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  scrollThumb: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },

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
  descriptionSubtitle: { color: '#7C8798', fontSize: 15, marginRight: 8 },
  descriptionText: { color: '#ECEEF2', fontSize: 19, lineHeight: 23 },
  // Zastępczy komunikat, gdy film nie ma opisu w danych — odróżniony od
  // prawdziwego opisu (przygaszony, kursywa), żeby było jasne, że to informacja
  // systemowa, a nie treść filmu.
  descriptionTextEmpty: { color: '#7C8798', fontStyle: 'italic' },
  // Niewidoczna kopia do pomiaru naturalnej wysokości pełnego opisu — poza
  // ekranem, ale z realną (nieskończoną) wysokością, żeby onLayout zwrócił
  // prawdziwy rozmiar potrzebny na cały tekst.
  hiddenMeasure: { position: 'absolute', top: -4000, left: 0, opacity: 0 },
  // Osobny, nieanimowany pasek z podpowiedzią zwiń/rozwiń — stoi na stałe pod
  // animowaną nakładką opisu (patrz descriptionOverlay/HINT_BAR_HEIGHT w
  // komponencie), więc nigdy się nie porusza razem z jej animacją wysokości.
  // STAŁA wysokość (HINT_BAR_HEIGHT, wyśrodkowana treść) zamiast wysokości
  // mierzonej przez onLayout — eliminuje ryzyko chwilowego nakładania się na
  // dolną część nagłówka, zanim asynchroniczny pomiar by się ustabilizował.
  // Tło takie samo jak nakładki, dla wizualnej ciągłości.
  hintBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HINT_BAR_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Podpowiedź zwiń/rozwiń: +50% względem pierwotnego rozmiaru (11 -> ~17).
  expandHint: { color: '#7C8798', fontSize: 17, textAlign: 'center' },
});
