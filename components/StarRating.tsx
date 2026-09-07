import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

// Ocena TMDB (0-10) w formie dziesięciu gwiazdek — zaokrąglona do 0.5. Każda
// gwiazdka to jeden punkt (nie dwa, jak w klasycznej skali 5-gwiazdkowej):
// wypełniona na niebiesko = pełny punkt, "star-half" (podzielona pionowo) =
// pół punktu, pusta/biała = brak punktu.
const FILLED_COLOR = '#4C8DFF';
const EMPTY_COLOR = '#FFFFFF';

interface StarRatingProps {
  rating: number;
  size?: number;
  gap?: number;
}

export function StarRating({ rating, size = 11, gap = 1 }: StarRatingProps) {
  const rounded = Math.max(0, Math.min(10, Math.round(rating * 2) / 2));
  const stars = Array.from({ length: 10 }, (_, i) => {
    const starIndex = i + 1;
    if (rounded >= starIndex) return 'full';
    if (rounded + 0.5 === starIndex) return 'half';
    return 'empty';
  });

  return (
    <View style={styles.row}>
      {stars.map((kind, i) => (
        <Ionicons
          key={i}
          name={kind === 'full' ? 'star' : kind === 'half' ? 'star-half' : 'star-outline'}
          size={size}
          color={kind === 'empty' ? EMPTY_COLOR : FILLED_COLOR}
          style={{ marginRight: i < stars.length - 1 ? gap : 0 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
