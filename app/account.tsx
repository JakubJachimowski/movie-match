import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { useAuthStore } from '../store/useAuthStore';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [signOutModalVisible, setSignOutModalVisible] = useState(false);

  const handleConfirmSignOut = () => {
    setSignOutModalVisible(false);
    signOut();
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/moviematchbackground7.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <TouchableOpacity onPress={() => router.back()} hitSlop={36} style={styles.backButton}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.avatarWrapper} onPress={() => router.push('/profile')}>
        <Avatar url={profile?.avatar_url} size={110} fallbackLetter={profile?.username} />
      </TouchableOpacity>

      <Text style={styles.username}>{profile?.username ?? '...'}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.connectionsButton} onPress={() => router.push('/connections')}>
          <Text style={styles.connectionsButtonText}>Zarządzaj połączeniami</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.connectionsButton} onPress={() => router.push('/profile')}>
          <Text style={styles.connectionsButtonText}>Edytuj profil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.connectionsButton} onPress={() => router.push('/friends')}>
          <Text style={styles.connectionsButtonText}>Znajomi</Text>
        </TouchableOpacity>

        {/* Placeholdery na przyszłe funkcje: zmiana języka (flaga), jasny/ciemny
            motyw (słońce/księżyc), wyciszenie (głośnik) — na razie bez działania. */}
        <View style={styles.placeholderRow}>
          <View style={styles.placeholderButton}>
            <Text style={styles.placeholderIcon}>🏳️</Text>
          </View>
          <View style={styles.placeholderButton}>
            <Ionicons name="sunny-outline" size={17} color="#ECEEF2" />
            <Ionicons name="moon-outline" size={17} color="#ECEEF2" style={styles.placeholderIconSecond} />
          </View>
          <View style={styles.placeholderButton}>
            <Ionicons name="volume-high-outline" size={20} color="#ECEEF2" />
          </View>
        </View>
      </View>

      <View style={styles.spacer} />

      <TouchableOpacity
        style={[styles.signOutButton, { marginBottom: insets.bottom + 16 }]}
        onPress={() => setSignOutModalVisible(true)}
      >
        <Text style={styles.signOutButtonText}>Wyloguj się</Text>
      </TouchableOpacity>

      <Modal
        visible={signOutModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSignOutModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSignOutModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Image
              source={require('../assets/images/moviematchbackground7.png')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <View style={styles.modalOverlayTint} />

            <Text style={styles.modalTitle}>Wyloguj się</Text>
            <Text style={styles.modalMessage}>Na pewno chcesz się wylogować?</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setSignOutModalVisible(false)}>
                <Text style={styles.modalCancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleConfirmSignOut}>
                <Text style={styles.modalConfirmButtonText}>Wyloguj</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17', alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
  backButton: { position: 'absolute', top: 56, left: 20, zIndex: 1 },
  backArrow: { color: '#ECEEF2', fontSize: 26 },
  avatarWrapper: { marginTop: 24, marginBottom: 16 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 0.5, borderColor: '#7C8798' },
  avatarPlaceholder: { backgroundColor: '#141A24', alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholderText: { color: '#ECEEF2', fontSize: 36, fontWeight: 'bold' },
  username: { color: '#ECEEF2', fontSize: 22, fontWeight: 'bold' },
  email: { color: '#7C8798', fontSize: 14, marginTop: 4, marginBottom: 32 },
  buttonGroup: { width: '100%' },
  // Ten sam "chrom" co przyciski na stronie głównej (tło #141A24 + cienka
  // ramka #7C8798) zamiast poprzedniego płaskiego szarego (#333) — spójny
  // wygląd z resztą aplikacji. Przycisk "Wyloguj się" zostaje bez zmian.
  connectionsButton: {
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  connectionsButtonText: { color: '#ECEEF2', fontWeight: 'bold' },

  // Rząd trzech placeholderów (język / motyw / wyciszenie) pod przyciskiem
  // "Znajomi" — na razie bez działania, docelowe funkcje jeszcze nie istnieją.
  placeholderRow: { flexDirection: 'row', gap: 12, width: '100%' },
  placeholderButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 18 },
  placeholderIconSecond: { marginLeft: -2 },

  spacer: { flex: 1, minHeight: 24, width: '100%' },

  signOutButton: {
    borderWidth: 0.5,
    borderColor: '#E07A5F',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  signOutButtonText: { color: '#E07A5F', fontWeight: 'bold' },

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
  modalMessage: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginBottom: 20 },
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
