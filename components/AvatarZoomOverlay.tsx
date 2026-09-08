import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAvatarZoomStore } from '../store/useAvatarZoomStore';
import { Avatar } from './Avatar';

// overshootClamping: true — bez tego Animated.spring (z samym friction, bez
// tension) potrafi przestrzelić cel i odbić się z powrotem.
const SPRING_CONFIG = { friction: 8, tension: 50, overshootClamping: true, useNativeDriver: true };
const DIM_DURATION = 220;

type Rect = { x: number; y: number; w: number; h: number };

function measureView(ref: React.RefObject<View | null>): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!ref.current) {
      resolve(null);
      return;
    }
    ref.current.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

// Jedyne miejsce, w którym renderuje się powiększony avatar — montowane RAZ
// w app/_layout.tsx, więc żyje w TYM SAMYM oknie systemowym co ekran z
// miniaturką (żadnego <Modal> — patrz store/useAvatarZoomStore.ts; Modal na
// Androidzie renderuje się w osobnym oknie, więc measureInWindow() wewnątrz
// niego i na miniaturce liczyłyby względem różnych punktów zerowych).
//
// Ten komponent jest w drzewie CAŁY CZAS — nigdy nie montowany/odmontowywany
// warunkowo. Robienie tego przy każdym otwarciu/zamknięciu wymagało za
// każdym razem nowego onLayout na świeżo zamontowanej ramce, co bywało
// niepewne (co drugie otwarcie potrafiło wystartować bez animacji). Zamiast
// tego ramka jest zmierzona (measureInWindow — NIE liczona ze
// screenWidth/2, screenHeight/2, bo widoczny obszar bywa węższy niż pełne
// okno) raz, przy pierwszym layoucie, i ta pozycja jest cache'owana.
export function AvatarZoomOverlay() {
  const { width: screenWidth } = useWindowDimensions();
  const visible = useAvatarZoomStore((s) => s.visible);
  const url = useAvatarZoomStore((s) => s.url);
  const size = useAvatarZoomStore((s) => s.size);
  const fallbackLetter = useAvatarZoomStore((s) => s.fallbackLetter);
  const anchor = useAvatarZoomStore((s) => s.anchor);
  const measureAnchor = useAvatarZoomStore((s) => s.measureAnchor);
  const close = useAvatarZoomStore((s) => s.close);

  const frameRef = useRef<View>(null);
  const frameRestRef = useRef<Rect | null>(null);

  const [ready, setReady] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(0)).current;

  const targetSize = screenWidth * 0.9;

  const computeOffset = (a: Rect, frame: Rect) => ({
    dx: a.x + a.w / 2 - (frame.x + frame.w / 2),
    dy: a.y + a.h / 2 - (frame.y + frame.h / 2),
    s: (a.w || size || targetSize) / (frame.w || targetSize),
  });

  // Ramka jest zamontowana od startu appki — jej pierwszy layout mierzymy
  // i cache'ujemy raz.
  const handleFrameLayout = () => {
    measureView(frameRef).then((frame) => {
      if (frame) frameRestRef.current = frame;
    });
  };

  const beginOpenAnimation = (dx: number, dy: number, s: number) => {
    translateX.setValue(dx);
    translateY.setValue(dy);
    scale.setValue(s);
    dim.setValue(0);
    setReady(true);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, ...SPRING_CONFIG }),
        Animated.spring(translateY, { toValue: 0, ...SPRING_CONFIG }),
        Animated.spring(scale, { toValue: 1, ...SPRING_CONFIG }),
        Animated.timing(dim, { toValue: 1, duration: DIM_DURATION, useNativeDriver: true }),
      ]).start();
    });
  };

  useEffect(() => {
    if (!visible || !anchor) return;
    let cancelled = false;
    (async () => {
      let frame = frameRestRef.current;
      if (!frame) {
        frame = await measureView(frameRef);
        if (frame) frameRestRef.current = frame;
      }
      if (cancelled || !frame) return;
      const { dx, dy, s } = computeOffset(anchor, frame);
      beginOpenAnimation(dx, dy, s);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, anchor]);

  const handleClose = async () => {
    // Mierzymy miniaturkę na świeżo tuż przed animacją zamykania, zamiast
    // ufać wyłącznie pozycji sprzed otwarcia.
    const fresh = measureAnchor ? await measureAnchor() : null;
    const target = fresh ?? anchor;
    const frame = frameRestRef.current;
    if (!target || !frame) {
      close();
      setReady(false);
      return;
    }
    const { dx, dy, s } = computeOffset(target, frame);
    Animated.parallel([
      Animated.spring(translateX, { toValue: dx, ...SPRING_CONFIG }),
      Animated.spring(translateY, { toValue: dy, ...SPRING_CONFIG }),
      Animated.spring(scale, { toValue: s, ...SPRING_CONFIG }),
      Animated.timing(dim, { toValue: 0, duration: DIM_DURATION, useNativeDriver: true }),
    ]).start(() => {
      close();
      setReady(false);
    });
  };

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: dim }]} />
      <TouchableOpacity style={styles.center} activeOpacity={1} onPress={handleClose}>
        <Animated.View
          ref={frameRef}
          onLayout={handleFrameLayout}
          style={[
            styles.frame,
            {
              width: targetSize,
              height: targetSize,
              opacity: ready ? 1 : 0,
              transform: [{ translateX }, { translateY }, { scale }],
            },
          ]}
        >
          <Avatar url={url} size={targetSize} fallbackLetter={fallbackLetter} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {},
});
