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

// Historia przesunięć znajomego — dostępna z jego profilu (przycisk "Historia" w
// app/friend-profile/[connectionId].tsx). Avatar znajomego mieszka teraz na
// ekranie profilu (z powiększaniem do 3/4 szerokości ekranu), nie tutaj.
export default function FriendHistoryScreen() {
  const router = useRouter();
  const { connectionId, partnerId, username } = useLocalSearchParams<{
    connectionId: string;
    partnerId: string;
    username: string;
    avatarUrl?: string;
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
        source={require('../../assets/background/maintenace_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Historia — {username || '(nieznany)'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#ECEEF2" style={{ marginTop: 24 }} />
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
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,15,23,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#ECEEF2', fontSize: 26 },
  headerTitle: { color: '#ECEEF2', fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center' },

  emptyText: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },

  listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141A24',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  arrow: { fontSize: 18, fontWeight: 'bold', width: 26 },
  arrowRight: { color: '#4a7' },
  arrowLeft: { color: '#E07A5F' },
  rowText: { color: '#ECEEF2', fontSize: 14, flex: 1 },
});
