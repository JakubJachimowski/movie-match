import { Image } from 'expo-image';
import { Modal, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface MatchPopupProps {
  visible: boolean;
  title: string | null;
  year: string | null;
  image: string | null;
  onClose: () => void;
}

export function MatchPopup({ visible, title, year, image, onClose }: MatchPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <Text style={styles.heading}>To dopasowanie! 🎉</Text>
          {image ? <Image source={{ uri: image }} style={styles.poster} contentFit="cover" /> : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
            {year ? ` (${year})` : ''}
          </Text>
          <Text style={styles.subtitle}>Obydwoje chcecie to obejrzeć!</Text>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Super!</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  card: {
    backgroundColor: '#1E1D18',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#E8A33D',
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  heading: { color: '#E8A33D', fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  poster: { width: 140, height: 210, borderRadius: 12, marginBottom: 14 },
  title: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: '#B5AFA0', fontSize: 14, textAlign: 'center', marginBottom: 18 },
  button: { backgroundColor: '#E8A33D', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 30 },
  buttonText: { color: '#26251F', fontWeight: 'bold', fontSize: 15 },
});
