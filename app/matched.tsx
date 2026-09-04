import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MovieDetailModal } from '../components/swipe/MovieDetailModal';
import { supabase } from '../lib/supabase';
import { useConnectionsStore } from '../store/useConnectionsStore';

interface MatchRow {
  id: string;
  movie_id: string;
  title: string;
  year: string | null;
  image: string | null;
  matched_at: string;
}

export default function MatchedScreen() {
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);

  useEffect(() => {
    if (!activeConnectionId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('matches')
      .select('id, movie_id, title, year, image, matched_at')
      .eq('connection_id', activeConnectionId)
      .order('matched_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('fetch matches error', error);
          setMatches([]);
        } else {
          setMatches(data ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Wspólnie polubione (${matches.length})` }} />
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      {!activeConnectionId ? (
        <View style={styles.centerContent}>
          <Text style={styles.text}>
            Wybierz aktywnego znajomego w sekcji „Znajomi", żeby zobaczyć wspólnie polubione filmy.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color="#E8E4D9" />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.text}>Wspólnie polubione filmy pojawią się tutaj, gdy oboje przesuniecie ten sam tytuł w prawo.</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => setSelectedMatch(item)}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.poster} contentFit="cover" />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]} />
              )}
              <Text style={styles.rowText} numberOfLines={2}>
                {item.title}
                {item.year ? ` (${item.year})` : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <MovieDetailModal
        visible={!!selectedMatch}
        movieId={selectedMatch?.movie_id ?? null}
        fallbackTitle={selectedMatch?.title}
        fallbackYear={selectedMatch?.year}
        fallbackImage={selectedMatch?.image}
        onClose={() => setSelectedMatch(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 24 },

  listContent: { padding: 20, paddingTop: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D18',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    padding: 10,
    marginBottom: 8,
  },
  poster: { width: 40, height: 58, borderRadius: 6, marginRight: 12 },
  posterPlaceholder: { backgroundColor: '#333' },
  rowText: { color: '#E8E4D9', fontSize: 15, flex: 1 },
});
