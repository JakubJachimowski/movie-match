import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { useAuthStore } from '../store/useAuthStore';

export default function AccountScreen() {
  const router = useRouter();
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

      <Pressable
        style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
        onPress={() => router.push('/settings')}
      >
        <Text style={styles.settingsIcon}>⚙</Text>
      </Pressable>

      <TouchableOpacity style={styles.avatarWrapper} onPress={() => router.push('/profile')}>
        <Avatar url={profile?.avatar_url} size={110} fallbackLetter={profile?.username} />
      </TouchableOpacity>

      <Text style={styles.username}>{profile?.username ?? '...'}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <TouchableOpacity style={styles.connectionsButton} onPress={() => router.push('/connections')}>
        <Text style={styles.connectionsButtonText}>Zarządzaj połączeniami</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.connectionsButton} onPress={() => router.push('/friends')}>
        <Text style={styles.connectionsButtonText}>Znajomi</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={() => setSignOutModalVisible(true)}>
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
  settingsButton: {
    position: 'absolute',
    top: 32,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  settingsButtonPressed: { backgroundColor: 'rgba(0,0,0,0.75)' },
  settingsIcon: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold' },
  avatarWrapper: { marginBottom: 16 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 0.5, borderColor: '#7C8798' },
  avatarPlaceholder: { backgroundColor: '#141A24', alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholderText: { color: '#ECEEF2', fontSize: 36, fontWeight: 'bold' },
  username: { color: '#ECEEF2', fontSize: 22, fontWeight: 'bold' },
  email: { color: '#7C8798', fontSize: 14, marginTop: 4, marginBottom: 32 },
  connectionsButton: {
    backgroundColor: '#333',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  connectionsButtonText: { color: '#ECEEF2', fontWeight: 'bold' },
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
