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
const FLING_MIN_SPEED = 400;

// Odrzucana karta ma wyglądać, jakby ktoś ją "zabierał" znad dołu telefonu:
// poziomy ruch płynie CIĄGLE przez cały czas trwania animacji (nigdy się nie
// zatrzymuje ani nie wygasza do prawie zera), a do niego DOCHODZI pionowy
// zjazd w dół — z początku ledwo zauważalny, potem gwałtownie przyspieszający,
// jakby karta realnie znikała pod dolną krawędzią ekranu.
const EXIT_HORIZONTAL_RATIO = 0.55;
const EXIT_VERTICAL_RATIO = 1.05;
// Faza 1 pionu (wolna) vs faza 2 (mocne przyspieszenie w dół): czas trwania i
// jak daleko wzdłuż trasy Y dochodzi karta pod koniec pierwszej fazy.
const EXIT_PHASE1_DURATION_RATIO = 0.38;
const EXIT_PHASE1_Y_FRACTION = 0.12;

// Nowa karta ma wyglądać, jakby ktoś ją "podawał" znad góry telefonu:
// spada głównie pionowo (jeszcze częściowo poza ekranem/widoczna od góry),
// po czym w końcowej fazie prostuje się w ruch poziomy, osiadając na miejscu.
const ENTER_DURATION = 380;
const ENTER_HORIZONTAL_RATIO = 0.5;
const ENTER_VERTICAL_RATIO = 1.05;
// Faza 1 (pionowa): czas trwania i jak daleko wzdłuż trasy Y/X dochodzi karta.
const ENTER_PHASE1_DURATION_RATIO = 0.62;
const ENTER_PHASE1_Y_FRACTION = 0.85;
const ENTER_PHASE1_X_FRACTION = 0.12;

// Cofnięcie (Cofnij): karta ma "wracać" z tej samej strony, w którą ją
// pierwotnie przesunięto — czysto poziomy zjazd do środka, bez łuku pionowego.
const UNDO_RETURN_DURATION = 260;

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
    isAnimatingRef.current = true;
    const offsetX = (areaSize?.width || 400) * ENTER_HORIZONTAL_RATIO;
    const offsetY = (areaSize?.height || 700) * ENTER_VERTICAL_RATIO;
    const startX = fromDirection === 'left' ? offsetX : -offsetX;
    const startY = -offsetY;

    cardTranslateX.setValue(startX);
    cardTranslateY.setValue(startY);
    // Wjazd nowej karty nie jest decyzją użytkownika — mimo że po drodze
    // cardTranslateX przechodzi przez te same wartości co przy przeciąganiu,
    // tint/stemple mają zostać wyłączone przez cały czas trwania tej animacji.
    tintEnabled.setValue(0);

    const phase1Duration = ENTER_DURATION * ENTER_PHASE1_DURATION_RATIO;
    const phase2Duration = ENTER_DURATION - phase1Duration;
    // Faza 1: spada głównie pionowo "znad góry telefonu", X ledwo drgnie.
    const phase1Y = startY + (0 - startY) * ENTER_PHASE1_Y_FRACTION;
    const phase1X = startX + (0 - startX) * ENTER_PHASE1_X_FRACTION;

    Animated.parallel([
      Animated.sequence([
        Animated.timing(cardTranslateY, {
          toValue: phase1Y,
          duration: phase1Duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: phase2Duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(cardTranslateX, {
          toValue: phase1X,
          duration: phase1Duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Faza 2: proste się w ruch poziomy — X "dogania" do środka.
        Animated.timing(cardTranslateX, {
          toValue: 0,
          duration: phase2Duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      isAnimatingRef.current = false;
      tintEnabled.setValue(1);
    });
  };

  // Cofnięcie poprzedniej decyzji: karta ma "wrócić" z TEJ SAMEJ strony, w którą
  // ją pierwotnie przesunięto (nie z przeciwnej, jak przy zwykłym wjeździe nowej
  // karty w animateEntrance) — ustawiamy więc jej pozycję startową bezpośrednio
  // na tej krawędzi ekranu i zjeżdżamy poziomo do środka.
  const animateUndoReturn = (originalDirection: 'left' | 'right') => {
    const offsetX = (areaSize?.width || 400) * EXIT_HORIZONTAL_RATIO;

    isAnimatingRef.current = true;
    cardTranslateX.setValue(originalDirection === 'left' ? -offsetX : offsetX);
    cardTranslateY.setValue(0);
    tintEnabled.setValue(0);

    Animated.timing(cardTranslateX, {
      toValue: 0,
      duration: UNDO_RETURN_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isAnimatingRef.current = false;
      tintEnabled.setValue(1);
    });
  };

  // Czas wylotu liczony fizycznie: czas = dystans / prędkość gestu — im mocniej
  // "rzucisz" kartę, tym szybciej realnie znika. Poziomy ruch (X) leci CIĄGLE
  // przez cały ten czas, jednym płynnym ruchem, bez zatrzymywania się ani
  // gwałtownego wygaszania tempa. RÓWNOLEGLE do niego dochodzi pionowy zjazd w
  // dół w dwóch fazach (najpierw wolno, potem mocne przyspieszenie) — tak, jakby
  // karta jednocześnie leciała w bok i znikała pod dolną krawędzią ekranu.
  // Cel fazy pionowej liczony jest WZGLĘDEM aktualnej (żywej, z przeciągania)
  // pozycji karty, nie od 0,0 — inaczej przy szybkim/dalekim geście mogłaby się
  // "cofnąć" zanim ruszy dalej.
  const performSwipe = (
    direction: 'left' | 'right',
    startX: number,
    startY: number,
    velocityX: number,
    velocityY: number
  ) => {
    if (!canSwipe() || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const offsetX = (areaSize?.width || 400) * EXIT_HORIZONTAL_RATIO;
    const offsetY = (areaSize?.height || 700) * EXIT_VERTICAL_RATIO;
    const targetX = direction === 'left' ? -offsetX : offsetX;
    const targetY = offsetY;

    const distance = Math.hypot(offsetX, offsetY);
    const speed = Math.max(Math.hypot(velocityX, velocityY), FLING_MIN_SPEED);
    const duration = clamp((distance / speed) * 1000, MIN_EXIT_DURATION, MAX_EXIT_DURATION);
    const phase1Duration = duration * EXIT_PHASE1_DURATION_RATIO;
    const phase2Duration = duration - phase1Duration;
    const phase1Y = startY + (targetY - startY) * EXIT_PHASE1_Y_FRACTION;

    Animated.parallel([
      // Poziomy ruch NIE jest już dzielony na fazy ani wygaszany — płynie
      // ciągle przez cały czas trwania animacji (lekko zwalniając pod koniec,
      // naturalnie, jak przy rzucie), a nie "dogania" tylko resztkę dystansu
      // w drugiej fazie. Pionowy zjazd w dół (faza 1 wolno, faza 2 mocne
      // przyspieszenie) DOCHODZI do tego ruchu, zamiast go zastępować.
      Animated.timing(cardTranslateX, {
        toValue: targetX,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(cardTranslateY, {
          toValue: phase1Y,
          duration: phase1Duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Faza 2: przyspieszenie w dół, jakby karta "spadała" pod dolną krawędź.
        Animated.timing(cardTranslateY, {
          toValue: targetY,
          duration: phase2Duration,
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
      const { translationX, translationY, velocityX, velocityY } = event.nativeEvent;
      const threshold = (areaSize?.width || 400) * 0.25;
      const startX = baseX.current + translationX;
      const startY = baseY.current + translationY;

      if (translationX > threshold || velocityX > 800) {
        performSwipe('right', startX, startY, velocityX, velocityY);
      } else if (translationX < -threshold || velocityX < -800) {
        performSwipe('left', startX, startY, velocityX, velocityY);
      } else {
        snapBack(velocityX, velocityY);
      }
    }
  };

  // Rotacja jako interpolacja bezpośrednio z pozycji X — automatycznie podąża
  // za kartą niezależnie od tego, który mechanizm (timing/spring) ją porusza.
  const pivotOffset = cardHeight / 2 + BOTTOM_BAR_HEIGHT_ESTIMATE + PIVOT_BELOW_UNDO;
  const rotationMaxX = (areaSize?.width || 400) * EXIT_HORIZONTAL_RATIO;
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
    animateUndoReturn,
  };
}
