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
  onGestureEvent: (event: any) => void;
  onHandlerStateChange: (event: any) => void;
}

export function MovieCard({
  movie,
  cardWidth,
  cardHeight,
  runtime,
  providers,
  cardTranslateX,
  cardTranslateY,
  rotateInterpolate,
  onGestureEvent,
  onHandlerStateChange,
}: MovieCardProps) {
  const subtitleParts = [movie.country, runtime ? `${runtime} min` : runtime === null ? null : '...', `${movie.voteAverage.toFixed(1)}/10`]
    .filter(Boolean)
    .join(' • ');

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.descriptionScrollContent}>
              <View style={styles.descriptionSpacer} />
              <View style={styles.titleRow}>
                <Text style={styles.descriptionTitle} numberOfLines={2}>{movie.title}</Text>
                <Text style={styles.providersText} numberOfLines={2}>
                  {providers === undefined ? '...' : providers?.length ? providers.join('\n') : 'Brak w VOD'}
                </Text>
              </View>
              <Text style={styles.descriptionSubtitle}>({subtitleParts})</Text>
              <Text style={styles.descriptionText}>{movie.description}</Text>
            </ScrollView>
          </View>
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
  descriptionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  descriptionSpacer: { height: 20 },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  descriptionTitle: { color: '#E8E4D9', fontSize: 23, fontWeight: 'bold', flex: 1, marginRight: 8 },
  providersText: { color: '#B5AFA0', fontSize: 12, textAlign: 'right', maxWidth: '35%' },

  descriptionSubtitle: { color: '#B5AFA0', fontSize: 12, marginBottom: 8 },
  descriptionText: { color: '#E8E4D9', fontSize: 17, lineHeight: 21 },
});
