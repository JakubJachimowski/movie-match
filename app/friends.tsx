import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Partner, useConnectionsStore } from '../store/useConnectionsStore';

export default function FriendsScreen() {
  const router = useRouter();
  const partners = useConnectionsStore((s) => s.partners);
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const loading = useConnectionsStore((s) => s.loading);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const setActiveConnection = useConnectionsStore((s) => s.setActiveConnection);
  const removeConnection = useConnectionsStore((s) => s.removeConnection);

  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeConnection(deleteTarget.connectionId);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/background/maintenace_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Znajomi</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        {loading && partners.length === 0 ? (
          <ActivityIndicator color="#ECEEF2" style={{ marginTop: 24 }} />
        ) : partners.length === 0 ? (
          <Text style={styles.emptyText}>
            Nie masz jeszcze żadnego znajomego. Wygeneruj kod zaproszenia albo dołącz do kogoś cudzym kodem w
            „Zarządzaj połączeniami".
          </Text>
        ) : (
          partners.map((p) => {
            const active = p.connectionId === activeConnectionId;
            return (
              <View key={p.connectionId} style={styles.partnerRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.mainPanel}
                  onPress={() =>
                    router.push({
                      pathname: '/friend-profile/[connectionId]',
                      params: {
                        connectionId: p.connectionId,
                        partnerId: p.partnerId,
                        username: p.username,
                        avatarUrl: p.avatarUrl ?? '',
                      },
                    })
                  }
                >
                  <View style={{ marginRight: 12 }}>
                    <Avatar url={p.avatarUrl} size={40} fallbackLetter={p.username} />
                  </View>
                  <Text style={styles.partnerName} numberOfLines={1}>{p.username}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.choicePanel, active && styles.choicePanelActive]}
                  onPress={() => setActiveConnection(p.connectionId)}
                  hitSlop={4}
                >
                  <Text style={[styles.choicePanelText, active && styles.choicePanelTextActive]}>
                    {active ? 'Aktywny ✓' : 'Wybierz'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.deletePanel}
                  onPress={() => setDeleteTarget(p)}
                  hitSlop={4}
                >
                  <Ionicons name="close" size={18} color="#E07A5F" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <Modal
        visible={!!deleteTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteTarget(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDeleteTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Image
              source={require('../assets/background/maintenace_background.png')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <View style={styles.modalOverlayTint} />

            <Text style={styles.modalTitle}>Usuń znajomego</Text>
            <Text style={styles.modalMessage}>
              Na pewno chcesz usunąć {deleteTarget?.username} z listy znajomych? Wasza wspólna historia i dopasowania
              znikną.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <Text style={styles.modalCancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={confirmDelete} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Usuń</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
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

  content: { padding: 20 },
  emptyText: { color: '#7C8798', fontSize: 14, lineHeight: 20 },

  // Trzy oddzielne panele w jednym wierszu: avatar+nick / wybierz-aktywny / usuń.
  // Razem zajmują tyle samo miejsca, co dawny pojedynczy, ciągły wiersz.
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
    gap: 8,
  },
  mainPanel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141A24',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 10,
  },
  partnerName: { color: '#ECEEF2', fontSize: 15, flex: 1 },

  choicePanel: {
    borderWidth: 1,
    borderColor: '#7C8798',
    borderRadius: 14,
    backgroundColor: '#141A24',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choicePanelActive: { backgroundColor: '#4a7', borderColor: '#4a7' },
  choicePanelText: { color: '#7C8798', fontSize: 11, fontWeight: 'bold' },
  choicePanelTextActive: { color: '#12211A' },

  deletePanel: {
    width: 44,
    borderWidth: 0.5,
    borderColor: '#E07A5F',
    borderRadius: 14,
    backgroundColor: '#141A24',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalContent: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 24,
    borderWidth: 0.5,
    borderColor: '#7C8798',
  },
  modalOverlayTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,29,24,0.88)' },
  modalTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  modalMessage: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#555',
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    marginRight: 8,
  },
  modalCancelButtonText: { color: '#fff', fontWeight: 'bold' },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#E07A5F',
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    marginLeft: 8,
  },
  modalConfirmButtonText: { color: '#fff', fontWeight: 'bold' },
});
