import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Modal } from 'react-native';
import { useMovieStore, Movie } from '../store/useMovieStore';

export default function DislikedScreen() {
  const disliked = useMovieStore((state) => state.disliked);
  const removeDisliked = useMovieStore((state) => state.removeDisliked);
  const [selected, setSelected] = useState<Movie | null>(null);

  return (
    <View style={styles.container}>
      <FlatList
        data={disliked}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tile} onPress={() => setSelected(item)}>
            <Image source={item.image} style={styles.image} resizeMode="cover" />
            <Text style={styles.title}>{item.title}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Brak odrzuconych filmów</Text>}
      />

      <Modal visible={!!selected} animationType="fade">
        {selected && (
          <View style={styles.modalContainer}>
            <Image source={selected.image} style={styles.fullImage} resizeMode="contain" />
            <Text style={styles.modalTitle}>{selected.title}</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => {
                  removeDisliked(selected);
                  setSelected(null);
                }}
              >
                <Text style={styles.removeButtonText}>Usuń z listy</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
                <Text style={styles.closeButtonText}>Zamknij</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  list: { padding: 12 },
  row: { justifyContent: 'space-between' },
  tile: {
    width: '48%',
    aspectRatio: 2 / 3,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1E1D18',
  },
  image: { width: '100%', height: '100%' },
  title: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#E8E4D9',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },

  modalContainer: { flex: 1, backgroundColor: '#26251F', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '75%' },
  modalTitle: { color: '#E8E4D9', fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  modalButtons: { flexDirection: 'row', marginTop: 24, gap: 16 },
  removeButton: { backgroundColor: '#e74c3c', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30 },
  removeButtonText: { color: '#fff', fontWeight: 'bold' },
  closeButton: { backgroundColor: '#555', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30 },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
});