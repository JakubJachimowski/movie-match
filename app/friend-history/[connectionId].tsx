import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface DecisionRow {
  id: string;
  title: string;
  year: string | null;
  direction: 'left' | 'right';
}

export default function FriendHistoryScreen() {
  const router = useRouter();
  const { connectionId, partnerId, username } = useLocalSearchParams<{
    connectionId: string;
    partnerId: string;
    username: string;
  }>();

  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('decisions')
        .select('id, title, year, direction')
        .eq('connection_id', connectionId)
        .eq('user_id', partnerId)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
      } else {
        setDecisions((data ?? []) as DecisionRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionId, partnerId]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{username ?? 'Historia'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#E8E4D9" style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.emptyText}>{error}</Text>
      ) : decisions.length === 0 ? (
        <Text style={styles.emptyText}>{username} nie przesunął jeszcze żadnego filmu.</Text>
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.arrow, item.direction === 'right' ? styles.arrowRight : styles.arrowLeft]}>
                {item.direction === 'right' ? '→' : '←'}
              </Text>
              <Text style={styles.rowText} numberOfLines={1}>
                {item.title}
                {item.year ? ` (${item.year})` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#E8E4D9', fontSize: 26 },
  headerTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold' },

  emptyText: { color: '#B5AFA0', fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D18',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  arrow: { fontSize: 18, fontWeight: 'bold', width: 26 },
  arrowRight: { color: '#4a7' },
  arrowLeft: { color: '#E07A5F' },
  rowText: { color: '#E8E4D9', fontSize: 14, flex: 1 },
});
