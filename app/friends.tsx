import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConnectionsStore } from '../store/useConnectionsStore';

export default function FriendsScreen() {
  const router = useRouter();
  const partners = useConnectionsStore((s) => s.partners);
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const loading = useConnectionsStore((s) => s.loading);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const setActiveConnection = useConnectionsStore((s) => s.setActiveConnection);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Znajomi</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        {loading && partners.length === 0 ? (
          <ActivityIndicator color="#E8E4D9" style={{ marginTop: 24 }} />
        ) : partners.length === 0 ? (
          <Text style={styles.emptyText}>
            Nie masz jeszcze żadnego znajomego. Wygeneruj kod zaproszenia albo dołącz do kogoś cudzym kodem w
            „Zarządzaj połączeniami".
          </Text>
        ) : (
          partners.map((p) => {
            const active = p.connectionId === activeConnectionId;
            return (
              <TouchableOpacity
                key={p.connectionId}
                style={[styles.partnerRow, active && styles.partnerRowActive]}
                onPress={() => {
                  setActiveConnection(p.connectionId);
                  router.push({
                    pathname: '/friend-history/[connectionId]',
                    params: { connectionId: p.connectionId, partnerId: p.partnerId, username: p.username },
                  });
                }}
              >
                {p.avatarUrl ? (
                  <Image source={{ uri: p.avatarUrl }} style={styles.partnerAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.partnerAvatar, styles.partnerAvatarPlaceholder]}>
                    <Text style={styles.partnerAvatarText}>{p.username.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.partnerName}>{p.username}</Text>
                {active && <Text style={styles.activeBadge}>aktywny</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </View>
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

  content: { padding: 20 },
  emptyText: { color: '#B5AFA0', fontSize: 14, lineHeight: 20 },

  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D18',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    padding: 10,
    marginBottom: 8,
  },
  partnerRowActive: { borderColor: '#4a7', borderWidth: 1.5 },
  partnerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  partnerAvatarPlaceholder: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  partnerAvatarText: { color: '#E8E4D9', fontWeight: 'bold' },
  partnerName: { color: '#E8E4D9', fontSize: 15, flex: 1 },
  activeBadge: { color: '#4a7', fontSize: 12, fontWeight: 'bold' },
});
