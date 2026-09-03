import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GENRES } from '../../constants/genres';

export default function Home() {
  const router = useRouter();

  const rows: (typeof GENRES)[] = [];
  for (let i = 0; i < GENRES.length; i += 2) {
    rows.push(GENRES.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroWrapper}>
        <Image
          source={require('../../assets/photos/Wiktoria_test_5.jpg')}
          style={styles.heroImage}
          contentFit="cover"
        />
        <View style={styles.overlay}>
          <Text style={styles.appTitle}>MovieMatch</Text>
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => Alert.alert('Ustawienia', 'Konto, dźwięk i ustawienia aplikacji — wkrótce.')}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.genreArea}>
        {rows.map((row, idx) => (
          <View key={idx} style={styles.genreRow}>
            {row.map((genre) => (
              <TouchableOpacity
                key={genre.id}
                style={styles.genreTile}
                onPress={() =>
                  router.push({ pathname: '/swipe', params: { genreId: genre.id, genreName: genre.name } })
                }
              >
                <Text style={styles.genreText}>{genre.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  heroWrapper: { width: '100%', height: 242 },
  heroImage: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appTitle: { fontSize: 32, fontWeight: 'bold', color: '#E8E4D9' },
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
  },
  settingsIcon: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold' },

  genreArea: { flex: 1, padding: 12 },
  genreRow: { flex: 1, flexDirection: 'row' },
  genreTile: {
    flex: 1,
    margin: 6,
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreText: { color: '#E8E4D9', fontSize: 16, fontWeight: 'bold' },
});