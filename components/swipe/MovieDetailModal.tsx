import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchMovieFullDetails, MovieFullDetails } from '../../services/tmdb';
import { StarRating } from '../StarRating';

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
    ? [details.country, details.runtime ? `${details.runtime} min` : null].filter(Boolean).join(' • ')
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          {loading && !details ? (
            <ActivityIndicator color="#ECEEF2" style={{ marginVertical: 40 }} />
          ) : (
            <>
              {image ? <Image source={{ uri: image }} style={styles.poster} contentFit="cover" /> : null}
              <ScrollView
                style={styles.textArea}
                showsVerticalScrollIndicator
                indicatorStyle="white"
                persistentScrollbar
                scrollIndicatorInsets={{ right: 1 }}
              >
                <Text style={styles.title}>
                  {title}
                  {year ? ` (${year})` : ''}
                </Text>
                {subtitleParts ? <Text style={styles.subtitle}>{subtitleParts}</Text> : null}
                {details && (
                  <View style={styles.starsRow}>
                    <StarRating rating={details.voteAverage} size={13} gap={2} />
                  </View>
                )}
                <Text style={styles.description}>
                  {details ? details.description : 'Nie udało się pobrać opisu.'}
                </Text>
                {details && details.providers.length > 0 && (
                  <>
                    <Text style={styles.providersLabel}>Dostępne w:</Text>
                    <View style={styles.providersRow}>
                      {details.providers.map((p) =>
                        p.logoUrl ? (
                          <Image key={p.id} source={{ uri: p.logoUrl }} style={styles.providerLogo} contentFit="cover" />
                        ) : (
                          <Text key={p.id} style={styles.providers}>{p.name}</Text>
                        )
                      )}
                    </View>
                  </>
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
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 20,
    maxHeight: '85%',
    alignItems: 'center',
  },
  poster: { width: 160, height: 240, borderRadius: 12, marginBottom: 14 },
  textArea: { alignSelf: 'stretch' },
  title: { color: '#ECEEF2', fontSize: 19, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#7C8798', fontSize: 13, textAlign: 'center', marginBottom: 6 },
  starsRow: { alignItems: 'center', marginBottom: 10 },
  description: { color: '#ECEEF2', fontSize: 15, lineHeight: 21, marginBottom: 10 },
  providersLabel: { color: '#7C8798', fontSize: 13, textAlign: 'center', marginBottom: 6 },
  providersRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  providerLogo: { width: 36, height: 36, borderRadius: 8 },
  providers: { color: '#7C8798', fontSize: 13, textAlign: 'center' },
  closeButton: { backgroundColor: '#333', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 30, marginTop: 12 },
  closeButtonText: { color: '#ECEEF2', fontWeight: 'bold' },
});
