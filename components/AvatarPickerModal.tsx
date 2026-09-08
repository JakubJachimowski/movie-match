import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AVATAR_ASSET_OPTIONS } from './Avatar';

const AVATARS_PER_PAGE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fisher-Yates — losowa kolejność avatarów przy każdym otwarciu modala,
// żeby te same 4 nie zawsze lądowały na pierwszym ekranie.
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type AvatarOption = (typeof AVATAR_ASSET_OPTIONS)[number];

// 3 ekrany po 4 avatary (patrz components/Avatar.tsx — obecnie 12 gotowych avatarów).
function buildShuffledPages(): AvatarOption[][] {
  return chunk(shuffle(AVATAR_ASSET_OPTIONS), AVATARS_PER_PAGE);
}

const SLIDE_DISTANCE = 26;
const OUT_DURATION = 130;
const IN_DURATION = 220;

interface AvatarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onPickAsset: (value: string) => void;
  onPickPhoto: () => void;
  // Ekrany, które od razu wgrywają zdjęcie po wyborze (np. edycja profilu),
  // przekazują tu stan uploadu, żeby przycisk pokazał spinner zamiast tekstu.
  photoSaving?: boolean;
}

// Wspólny modal wyboru avatara — używany zarówno przy zakładaniu profilu
// (onboarding.tsx), jak i w jego późniejszej edycji (profile.tsx), żeby oba
// miejsca zawsze wyglądały i działały tak samo (patrz historia zmian w tym
// projekcie — rozjazd między tymi dwoma ekranami był źródłem zamieszania).
export function AvatarPickerModal({ visible, onClose, onPickAsset, onPickPhoto, photoSaving }: AvatarPickerModalProps) {
  const [pages, setPages] = useState<AvatarOption[][]>(() => buildShuffledPages());
  const [pageIndex, setPageIndex] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Przy każdym otwarciu modala: nowe losowe rozłożenie avatarów na strony i
  // powrót na pierwszy ekran.
  useEffect(() => {
    if (visible) {
      setPages(buildShuffledPages());
      setPageIndex(0);
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex === pages.length - 1;

  const goToPage = (nextIndex: number) => {
    if (nextIndex === pageIndex || nextIndex < 0 || nextIndex >= pages.length) return;
    // Kierunek animacji: w prawo (dalej) — bieżąca strona wyjeżdża w lewo,
    // nowa wjeżdża z prawej; w lewo (wstecz) — odwrotnie.
    const direction = nextIndex > pageIndex ? 1 : -1;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -direction * SLIDE_DISTANCE,
        duration: OUT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, { toValue: 0, duration: OUT_DURATION, useNativeDriver: true }),
    ]).start(() => {
      setPageIndex(nextIndex);
      slideAnim.setValue(direction * SLIDE_DISTANCE);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: IN_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, { toValue: 1, duration: IN_DURATION, useNativeDriver: true }),
      ]).start();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Wybierz avatar</Text>

          <View style={styles.pagerRow}>
            <TouchableOpacity
              style={[styles.arrowButton, isFirstPage && styles.arrowButtonDisabled]}
              onPress={() => goToPage(pageIndex - 1)}
              disabled={isFirstPage}
              hitSlop={10}
            >
              <Text style={[styles.arrowText, isFirstPage && styles.arrowTextDisabled]}>‹</Text>
            </TouchableOpacity>

            <Animated.View style={[styles.grid, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
              {pages[pageIndex].map((opt) => (
                <TouchableOpacity key={opt.id} style={styles.avatarSwatch} onPress={() => onPickAsset(opt.value)}>
                  <Image source={opt.source} style={styles.avatarSwatchImage} contentFit="cover" />
                </TouchableOpacity>
              ))}
            </Animated.View>

            <TouchableOpacity
              style={[styles.arrowButton, isLastPage && styles.arrowButtonDisabled]}
              onPress={() => goToPage(pageIndex + 1)}
              disabled={isLastPage}
              hitSlop={10}
            >
              <Text style={[styles.arrowText, isLastPage && styles.arrowTextDisabled]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dotsRow}>
            {pages.map((_, i) => (
              <View key={i} style={[styles.dot, i === pageIndex && styles.dotActive]} />
            ))}
          </View>

          <Text style={styles.orText}>lub</Text>
          <TouchableOpacity style={styles.uploadButton} onPress={onPickPhoto} disabled={photoSaving}>
            {photoSaving ? <ActivityIndicator color="#0B0F17" /> : <Text style={styles.uploadButtonText}>Prześlij zdjęcie</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 20,
  },
  title: { color: '#ECEEF2', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

  pagerRow: { flexDirection: 'row', alignItems: 'center' },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0B0F17',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: { opacity: 0.3 },
  arrowText: { color: '#ECEEF2', fontSize: 22, fontWeight: 'bold' },
  arrowTextDisabled: { color: '#7C8798' },

  // Siatka 2x2 (4 avatary/ekran) — rozmiar procentowy względem dostępnej
  // przestrzeni między strzałkami, żeby zawsze mieściła się na ekranie i była
  // maksymalnie duża.
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginHorizontal: 10,
  },
  avatarSwatch: { width: '42%', aspectRatio: 1, borderRadius: 999, borderWidth: 0.5, borderColor: '#7C8798', overflow: 'hidden' },
  avatarSwatchImage: { width: '100%', height: '100%' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3A4150' },
  dotActive: { width: 16, backgroundColor: '#ECEEF2' },

  orText: { color: '#7C8798', textAlign: 'center', fontSize: 13, marginBottom: 12 },
  uploadButton: { backgroundColor: '#ECEEF2', borderRadius: 30, paddingVertical: 12, alignItems: 'center' },
  uploadButtonText: { color: '#0B0F17', fontWeight: 'bold' },
});
