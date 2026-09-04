import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { fetchMovieFullDetails, MovieFullDetails } from '../../services/tmdb';

interface MovieDetailModalProps {
  visible: boolean;
  movieId: string | null;
  fallbackTitle?: string;
  fallbackYear?: string | null;
  fallbackImage?: string | null;
  onClose: () => void;
}

// Karta ze szczegółami filmu przywoływana po kliknięciu w pozycję na liście
// "wspólnie polubione" — dociąga pełny opis/czas trwania/dostawców VOD z TMDB
// na żądanie (w tabeli matches trzymamy tylko tytuł/rok/plakat).
export function MovieDetailModal({
  visible,
  movieId,
  fallbackTitle,
  fallbackYear,
  fallbackImage,
  onClose,
}: MovieDetailModalProps) {
  const [details, setDetails] = useState<MovieFullDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !movieId) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMovieFullDetails(movieId).then((data) => {
      if (!cancelled) {
        setDetails(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, movieId]);

  const title = details?.title ?? fallbackTitle ?? '';
  const image = details?.image || fallbackImage || null;
  const year = details?.year ?? fallbackYear ?? null;

  const subtitleParts = details
    ? [details.country, details.runtime ? `${details.runtime} min` : null, `${details.voteAverage.toFixed(1)}/10`]
        .filter(Boolean)
        .join(' • ')
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          {loading && !details ? (
            <ActivityIndicator color="#E8E4D9" style={{ marginVertical: 40 }} />
          ) : (
            <>
              {image ? <Image source={{ uri: image }} style={styles.poster} contentFit="cover" /> : null}
              <ScrollView style={styles.textArea}>
                <Text style={styles.title}>
                  {title}
                  {year ? ` (${year})` : ''}
                </Text>
                {subtitleParts ? <Text style={styles.subtitle}>{subtitleParts}</Text> : null}
                <Text style={styles.description}>
                  {details ? details.description : 'Nie udało się pobrać opisu.'}
                </Text>
                {details && details.providers.length > 0 && (
                  <Text style={styles.providers}>Dostępne w: {details.providers.join(', ')}</Text>
                )}
              </ScrollView>
            </>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Zamknij</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#1E1D18',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    padding: 20,
    maxHeight: '85%',
    alignItems: 'center',
  },
  poster: { width: 160, height: 240, borderRadius: 12, marginBottom: 14 },
  textArea: { alignSelf: 'stretch' },
  title: { color: '#E8E4D9', fontSize: 19, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#B5AFA0', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  description: { color: '#E8E4D9', fontSize: 15, lineHeight: 21, marginBottom: 10 },
  providers: { color: '#B5AFA0', fontSize: 13, textAlign: 'center' },
  closeButton: { backgroundColor: '#333', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 30, marginTop: 12 },
  closeButtonText: { color: '#E8E4D9', fontWeight: 'bold' },
});
