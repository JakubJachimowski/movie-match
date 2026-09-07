import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';

interface NotificationRow {
  id: string;
  type: 'match' | 'rating' | 'friend';
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<NotificationRow['type'], keyof typeof Ionicons.glyphMap> = {
  match: 'sparkles',
  rating: 'star',
  friend: 'people',
};

const TYPE_COLOR: Record<NotificationRow['type'], string> = {
  match: '#E8A33D',
  rating: '#4C8DFF',
  friend: '#4AA785',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'przed chwilą';
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} dni temu`;
  return date.toLocaleDateString('pl-PL');
}

// Ekran powiadomień: nowe dopasowania, oceny wystawione przez znajomego, nowe
// znajomości — wszystkie wypełniane po stronie bazy (triggery w schema.sql),
// więc ten ekran tylko czyta i oznacza jako przeczytane.
export default function NotificationsScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.session?.user.id) ?? null;
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, read, created_at')
        .eq('user_id', myId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.warn('fetch notifications error', error);
      } else {
        setItems((data ?? []) as NotificationRow[]);
        const unreadIds = (data ?? []).filter((r) => !r.read).map((r) => r.id);
        if (unreadIds.length > 0) {
          supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadIds)
            .then(({ error: updateError }) => {
              if (updateError) console.warn('mark notifications read error', updateError);
            });
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [myId]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/moviematchbackground7.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Powiadomienia</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#ECEEF2" style={{ marginTop: 24 }} />
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>Nie masz jeszcze żadnych powiadomień.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.row, !item.read && styles.rowUnread]}>
              <View style={[styles.iconBadge, { backgroundColor: TYPE_COLOR[item.type] }]}>
                <Ionicons name={TYPE_ICON[item.type]} size={18} color="#0B0F17" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {item.body ? <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text> : null}
                <Text style={styles.rowWhen}>{formatWhen(item.created_at)}</Text>
              </View>
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
  headerTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold' },

  emptyText: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },

  listContent: { padding: 20, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#141A24',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 12,
    marginBottom: 8,
  },
  rowUnread: { borderColor: '#E8A33D', borderWidth: 1 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: { color: '#ECEEF2', fontSize: 15, fontWeight: 'bold' },
  rowBody: { color: '#B9C0CC', fontSize: 13, marginTop: 2 },
  rowWhen: { color: '#7C8798', fontSize: 11, marginTop: 4 },
});
