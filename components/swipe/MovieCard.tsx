import { Image } from 'expo-image';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { Movie } from '../../store/useMovieStore';

interface MovieCardProps {
  movie: Movie;
  cardWidth: number;
  cardHeight: number;
  runtime: number | null | undefined;
  providers: string[] | null | undefined;
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
  const subtitleParts = [movie.country, runtime ? `${runtime} min` : runtime === null ? null : '...', `${movie.voteAverage.toFixed(1)}/10`]
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
          <View style={styles.descriptionOverlay}>
            <View style={styles.titleRow}>
              <Text style={styles.descriptionTitle} numberOfLines={2}>{movie.title}</Text>
              <Text style={styles.providersText} numberOfLines={2}>
                {providers === undefined ? '...' : providers?.length ? providers.join('\n') : 'Brak w VOD'}
              </Text>
            </View>
            <Text style={styles.descriptionSubtitle}>({subtitleParts})</Text>
            <ScrollView
              style={styles.descriptionScroll}
              contentContainerStyle={styles.descriptionScrollContent}
              showsVerticalScrollIndicator
              indicatorStyle="white"
              persistentScrollbar
              scrollIndicatorInsets={{ right: 1 }}
            >
              <Text style={styles.descriptionText}>{movie.description}</Text>
            </ScrollView>
          </View>

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
    backgroundColor: 'rgba(30,29,24,0.35)',
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
  emptyCardText: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 22 },

  descriptionOverlay: {
    position: 'absolute',
    top: '65%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  descriptionScroll: { flex: 1, marginTop: 6 },
  descriptionScrollContent: { flexGrow: 1 },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  descriptionTitle: { color: '#E8E4D9', fontSize: 23, fontWeight: 'bold', flex: 1, marginRight: 8 },
  providersText: { color: '#B5AFA0', fontSize: 12, textAlign: 'right', maxWidth: '35%' },

  descriptionSubtitle: { color: '#B5AFA0', fontSize: 12, marginBottom: 8 },
  descriptionText: { color: '#E8E4D9', fontSize: 17, lineHeight: 21 },
});
