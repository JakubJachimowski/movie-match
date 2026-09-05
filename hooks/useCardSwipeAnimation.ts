import { useRef } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import { State } from 'react-native-gesture-handler';

// Bazowa krzywa pionowego ruchu podczas przeciągania (mieszana z realnym ruchem palca).
const DRAG_ANGLE_DEG = 22;
const DRAG_SLOPE = Math.tan((DRAG_ANGLE_DEG * Math.PI) / 180);
const FALL_QUAD_COEFF = 0.002;
// 0 = pion w pełni "po krzywej", 1 = w pełni podąża za palcem.
const DRAG_FREEDOM = 0.5;

// Punkt zaczepienia rotacji — poniżej przycisku Cofnij, ok. 1/3 wysokości ekranu dalej.
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PIVOT_BELOW_UNDO = SCREEN_HEIGHT / 3;
const BOTTOM_BAR_HEIGHT_ESTIMATE = 110;

// Wylot: czas trwania liczony fizycznie jako dystans/prędkość gestu — im mocniej
// "rzucisz" kartę, tym szybciej faktycznie opuszcza ekran, zamiast stałego czasu.
const MIN_EXIT_DURATION = 160;
const MAX_EXIT_DURATION = 420;
const EXIT_Y_DELAY_RATIO = 0.28;
const FLING_MIN_SPEED = 400;

const ENTER_DURATION = 320;
const ENTER_X_DELAY = 110;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface UseCardSwipeAnimationArgs {
  areaSize: { width: number; height: number } | null;
  cardHeight: number;
  onSwipeComplete: (direction: 'left' | 'right') => void;
  canSwipe: () => boolean;
}

export function useCardSwipeAnimation({ areaSize, cardHeight, onSwipeComplete, canSwipe }: UseCardSwipeAnimationArgs) {
  const cardTranslateX = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);
  // Rzeczywista pozycja karty w chwili złapania jej nowym gestem — gdy poprzedni
  // gest kończył się "snapBackiem" (sprężyną), karta bywa jeszcze w locie
  // (nie na 0,0), więc nie można po prostu podstawić surowego translationX z
  // nowego gestu (to on jest liczony od 0 od nowego dotknięcia) — trzeba
  // doliczyć go do pozycji, w której karta faktycznie się znajdowała.
  const baseX = useRef(0);
  const baseY = useRef(0);
  // Kolorowanie/stemple na karcie mają reagować WYŁĄCZNIE na przeciąganie przez
  // użytkownika, nie na animację "wjazdu" nowej karty (ta też przejściowo
  // przechodzi przez te same wartości cardTranslateX, na których opiera się
  // interpolacja tintu). 1 = widoczne tak jak wynika z pozycji, 0 = wymuszone
  // zero niezależnie od pozycji.
  const tintEnabled = useRef(new Animated.Value(1)).current;

  const animateEntrance = (fromDirection: 'left' | 'right') => {
    const offsetX = (areaSize?.width || 400) * 1.3;
    const offsetY = (areaSize?.height || 700) * 0.45;

    cardTranslateX.setValue(fromDirection === 'left' ? offsetX : -offsetX);
    cardTranslateY.setValue(-offsetY);
    // Wjazd nowej karty nie jest decyzją użytkownika — mimo że po drodze
    // cardTranslateX przechodzi przez te same wartości co przy przeciąganiu,
    // tint/stemple mają zostać wyłączone przez cały czas trwania tej animacji.
    tintEnabled.setValue(0);

    Animated.parallel([
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(ENTER_X_DELAY),
        Animated.timing(cardTranslateX, {
          toValue: 0,
          duration: ENTER_DURATION - ENTER_X_DELAY,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      isAnimatingRef.current = false;
      tintEnabled.setValue(1);
    });
  };

  // Czas wylotu liczony fizycznie: czas = dystans / prędkość gestu.
  const performSwipe = (direction: 'left' | 'right', velocityX: number, velocityY: number) => {
    if (!canSwipe() || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const offsetX = (areaSize?.width || 400) * 1.3;
    const offsetY = (areaSize?.height || 700) * 0.65;
    const targetX = direction === 'left' ? -offsetX : offsetX;

    const distance = Math.hypot(offsetX, offsetY);
    const speed = Math.max(Math.hypot(velocityX, velocityY), FLING_MIN_SPEED);
    const duration = clamp((distance / speed) * 1000, MIN_EXIT_DURATION, MAX_EXIT_DURATION);
    const yDelay = duration * EXIT_Y_DELAY_RATIO;

    Animated.parallel([
      Animated.timing(cardTranslateX, {
        toValue: targetX,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(yDelay),
        Animated.timing(cardTranslateY, {
          toValue: offsetY,
          duration: duration - yDelay,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onSwipeComplete(direction);
      animateEntrance(direction);
    });
  };

  // Delikatne puszczenie: sprężyna wystartowana z rzeczywistą prędkością gestu jako
  // prędkością początkową — karta naturalnie "dojeżdża" w kierunku puszczenia,
  // po czym płynnie, z bezwładnością, wraca na środek.
  const snapBack = (velocityX: number, velocityY: number) => {
    baseX.current = 0;
    baseY.current = 0;
    Animated.parallel([
      Animated.spring(cardTranslateX, {
        toValue: 0,
        velocity: velocityX,
        useNativeDriver: true,
        friction: 9,
        tension: 45,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        velocity: velocityY,
        useNativeDriver: true,
        friction: 9,
        tension: 45,
      }),
    ]).start();
  };

  // Nowy dotyk — jeśli karta wciąż "leci" (np. jeszcze trwa sprężyna snapBacku
  // po poprzednim geście), zatrzymaj tę animację dokładnie w bieżącym miejscu i
  // zapamiętaj je jako bazę, zamiast pozwolić kolejnemu onGestureEvent nadpisać
  // pozycję surowym (liczonym od 0) translationX nowego gestu — to właśnie
  // powodowało chwilowy "powrót" karty na środek i nagły skok.
  const handleGestureBegin = () => {
    if (isAnimatingRef.current) return;
    cardTranslateX.stopAnimation((value) => {
      baseX.current = value;
    });
    cardTranslateY.stopAnimation((value) => {
      baseY.current = value;
    });
  };

  // Przeciąganie — pozycja ustawiana bezpośrednio na podstawie ruchu palca w każdej
  // klatce (doliczonego do zapamiętanej bazy), więc prędkość karty z definicji
  // dokładnie odpowiada prędkości gestu.
  const handleGestureEvent = (event: any) => {
    if (isAnimatingRef.current) return;
    const { translationX, translationY } = event.nativeEvent;
    const absX = Math.abs(translationX);

    const curveY = DRAG_SLOPE * absX + FALL_QUAD_COEFF * absX * absX;
    const y = curveY * (1 - DRAG_FREEDOM) + translationY * DRAG_FREEDOM;

    cardTranslateX.setValue(baseX.current + translationX);
    cardTranslateY.setValue(baseY.current + y);
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.BEGAN) {
      handleGestureBegin();
      return;
    }
    if (event.nativeEvent.oldState === State.ACTIVE) {
      if (isAnimatingRef.current) return;
      const { translationX, velocityX, velocityY } = event.nativeEvent;
      const threshold = (areaSize?.width || 400) * 0.25;

      if (translationX > threshold || velocityX > 800) {
        performSwipe('right', velocityX, velocityY);
      } else if (translationX < -threshold || velocityX < -800) {
        performSwipe('left', velocityX, velocityY);
      } else {
        snapBack(velocityX, velocityY);
      }
    }
  };

  // Rotacja jako interpolacja bezpośrednio z pozycji X — automatycznie podąża
  // za kartą niezależnie od tego, który mechanizm (timing/spring) ją porusza.
  const pivotOffset = cardHeight / 2 + BOTTOM_BAR_HEIGHT_ESTIMATE + PIVOT_BELOW_UNDO;
  const rotationMaxX = (areaSize?.width || 400) * 1.3;
  const rotationSteps = 10;
  const rotationInputRange: number[] = [];
  const rotationOutputRange: string[] = [];
  for (let i = -rotationSteps; i <= rotationSteps; i++) {
    const x = (i / rotationSteps) * rotationMaxX;
    const angleDeg = (Math.atan2(x, pivotOffset || 1) * 180) / Math.PI;
    rotationInputRange.push(x);
    rotationOutputRange.push(`${angleDeg}deg`);
  }
  const rotateInterpolate = cardTranslateX.interpolate({
    inputRange: rotationInputRange,
    outputRange: rotationOutputRange,
    extrapolate: 'clamp',
  });

  return {
    cardTranslateX,
    cardTranslateY,
    rotateInterpolate,
    tintEnabled,
    isAnimatingRef,
    handleGestureEvent,
    onHandlerStateChange,
    performSwipe,
    animateEntrance,
  };
}
