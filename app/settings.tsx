import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ustawienia</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.editProfileButton} onPress={() => router.push('/profile')}>
          <Text style={styles.editProfileButtonText}>Edytuj profil</Text>
        </TouchableOpacity>

        <Text style={styles.placeholderText}>
          Pozostałe ustawienia aplikacji (dźwięk, powiadomienia i inne) pojawią się tutaj wkrótce.
        </Text>
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
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  editProfileButton: {
    backgroundColor: '#333',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  editProfileButtonText: { color: '#E8E4D9', fontWeight: 'bold' },
  placeholderText: { color: '#B5AFA0', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
