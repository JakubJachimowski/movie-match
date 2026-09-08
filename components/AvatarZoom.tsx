import { useId, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAvatarZoomStore } from '../store/useAvatarZoomStore';
import { Avatar } from './Avatar';

interface AvatarZoomProps {
  url: string | null | undefined;
  size: number;
  fallbackLetter?: string;
}

// Sama miniaturka avatara + wyzwalacz powiększenia. Właściwa, powiększona
// wersja renderuje się gdzie indziej — patrz store/useAvatarZoomStore.ts i
// components/AvatarZoomOverlay.tsx (montowany raz w app/_layout.tsx) po
// wyjaśnienie, dlaczego animacja NIE jest już renderowana w tym komponencie
// ani w <Modal>.
export function AvatarZoom({ url, size, fallbackLetter }: AvatarZoomProps) {
  const ownerId = useId();
  const anchorRef = useRef<View>(null);
  const open = useAvatarZoomStore((s) => s.open);
  // Ukrywamy miniaturkę tylko wtedy, gdy TO WŁAŚNIE ONA jest właśnie
  // powiększona (inaczej przy dwóch AvatarZoom na ekranie zniknęłyby obie).
  const isMineAndOpen = useAvatarZoomStore((s) => s.visible && s.ownerId === ownerId);

  // Świeży pomiar miniaturki na żądanie — overlay wywoła to tuż przed
  // animacją zamykania, żeby cel animacji był policzony z NAJŚWIEŻSZEJ
  // pozycji, a nie tej sprzed otwarcia (na wypadek, gdyby coś na ekranie
  // się przez ten czas przesunęło).
  const measureAnchor = () =>
    new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
      if (!anchorRef.current) {
        resolve(null);
        return;
      }
      anchorRef.current.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
    });

  const handlePress = () => {
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      open({ ownerId, url, size, fallbackLetter, anchor: { x, y, w, h }, measureAnchor });
    });
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress}>
      <View ref={anchorRef} style={isMineAndOpen ? styles.hidden : undefined}>
        <Avatar url={url} size={size} fallbackLetter={fallbackLetter} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
});
