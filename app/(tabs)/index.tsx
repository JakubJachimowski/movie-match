import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeableStack, SwipeableStackRef } from 'react-native-swipeable-stack';
import { useMovieStore, Movie } from '../../store/useMovieStore';

export default function Index() {
  const stackRef = useRef<SwipeableStackRef>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const swipeRight = useMovieStore((state) => state.swipeRight);
  const swipeLeft = useMovieStore((state) => state.swipeLeft);
  const undoLast = useMovieStore((state) => state.undoLast);

  const [sessionQueue, setSessionQueue] = useState<Movie[]>(() => useMovieStore.getState().queue);
  const [sessionKey, setSessionKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [areaSize, setAreaSize] = useState<{ width: number; height: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setSessionQueue(useMovieStore.getState().queue);
      setSessionKey((k) => k + 1);
      setCurrentIndex(0);
    }, [])
  );

  const currentTitle = sessionQueue[currentIndex]?.title ?? '';

  const handleSwipeLeft = (movie: Movie) => {
    swipeLeft(movie);
    setCurrentIndex((i) => i + 1);
  };

  const handleSwipeRight = (movie: Movie) => {
    swipeRight(movie);
    setCurrentIndex((i) => i + 1);
  };

  const handleUndo = () => {
    stackRef.current?.undo();
    undoLast();
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  let cardWidth = 0;
  let cardHeight = 0;
  if (areaSize) {
    const baseHeight = Math.min(areaSize.height * 0.95, areaSize.width * 0.8 * 1.5);
    cardHeight = baseHeight * 1.1; // +10% wysokości, rozkłada się symetrycznie góra/dół
    cardWidth = cardHeight * (2 / 3);
  }

  const titleMarginTop = 8 + screenHeight * 0.05; // przesunięcie w dół o dodatkowe 5% wysokości ekranu

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={[styles.movieTitle, { marginTop: titleMarginTop }]}>{currentTitle}</Text>

      <View
        style={styles.cardArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAreaSize({ width, height });
        }}
      >
        {areaSize && (
          <SwipeableStack
            key={sessionKey}
            ref={stackRef}
            data={sessionQueue}
            keyExtractor={(item) => item.id}
            visibleCards={3}
            renderCard={(movie) => (
              <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
                <Image
                  source={movie.image}
                  style={{ width: cardWidth * 0.875, height: cardHeight * 0.833 }}
                  contentFit="contain"
                  transition={0}
                  cachePolicy="memory-disk"
                />

                <View style={styles.descriptionOverlay}>
                  <Text style={styles.descriptionText} numberOfLines={4}>
                    {movie.description}
                  </Text>
                </View>
              </View>
            )}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
          />
        )}
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.sideButton} onPress={() => router.push('/disliked')}>
          <Text style={styles.sideButtonText}>Odrzucone</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.undoButton} onPress={handleUndo}>
          <Text style={styles.undoText}>Cofnij</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideButton} onPress={() => router.push('/liked')}>
          <Text style={styles.sideButtonText}>Polubione</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },

  movieTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E8E4D9',
    textAlign: 'center',
    marginBottom: 8,
  },

  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  descriptionOverlay: {
    position: 'absolute',
    top: '75%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  descriptionText: {
    color: '#E8E4D9',
    fontSize: 13,
    lineHeight: 18,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },

  sideButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 30,
  },
  sideButtonText: { color: '#E8E4D9', fontSize: 14, fontWeight: 'bold' },

  undoButton: {
    backgroundColor: '#333',
    width: 65,
    height: 65,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: { color: '#E8E4D9', fontSize: 12, fontWeight: 'bold' },
});