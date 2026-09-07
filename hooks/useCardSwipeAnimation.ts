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

// PRÓBA ze sprężyną (Animated.spring napędzaną realną prędkością gestu)
// okazała się ślepą uliczką: X i Y mają BARDZO różne dystanse (55% szerokości
// vs 105% wysokości), więc przy tych samych parametrach sprężyny X "dojeżdżał"
// do celu dużo szybciej niż Y i zamierał (efekt "ściany"), a mocno tłumiona
// sprężyna na dużym dystansie ma długi, ledwo widoczny "ogon" dojazdu do celu
// (stąd wrażenie zatrzymania tuż przed krawędzią, a potem nagłego zniknięcia
// przy resecie do pozycji startowej wjazdu). Wracamy do Animated.timing —
// przewidywalny, ograniczony czasowo, gwarantuje pełne zejście poza ekran w
// stałym czasie, niezależnie od tego, jak "leniwie" kończyłaby się sprężyna.
//
// Czas trwania liczony fizycznie: dystans / prędkość gestu — im mocniej
// "rzucisz" kartę, tym szybciej realnie znika, zamiast stałego czasu.
const MIN_EXIT_DURATION = 220;
const MAX_EXIT_DURATION = 420;
const FLING_MIN_SPEED = 400;

const EXIT_HORIZONTAL_RATIO = 0.55;
const EXIT_VERTICAL_RATIO = 1.05;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const ENTER_DURATION = 380;
const ENTER_HORIZONTAL_RATIO = 0.5;
const ENTER_VERTICAL_RATIO = 1.05;

// --- Model ruchu oparty na UDZIALE OSI W CHWILOWEJ PRĘDKOŚCI ---------------
// Zamiast dwóch niezależnie dobranych krzywych (jedna na X, jedna na Y), które
// zawsze prowadzą do jakiegoś "załamania" (bo w danej chwili każda oś ma swój
// własny, przypadkowy udział w ruchu), animacja jest tu opisana wprost tak,
// jak wyglądać ma na ekranie: jaki % ruchu w danej chwili idzie w poziom, a
// jaki w pion — i ten podział płynnie, jedną krzywą, przechodzi od stanu
// startowego do docelowego. Przy wjeździe: start = 100% pion / 0% poziom,
// koniec = 25% pion / 75% poziom. Przy wyrzucie po swipe: dokładnie odwrotnie
// — start = 100% poziom / 0% pion, koniec = 75% pion / 25% poziom (to
// moment, w którym karta w zasadzie znika z ekranu). Zmiana udziału sama
// biegnie po krzywej ease-out (szybka zaraz po starcie, coraz wolniejsza w
// miarę zbliżania się do wartości końcowej) — stąd np. przy wjeździe udział
// poziomu skacze z 0% do ok. 25% już na samym początku animacji, potem
// zbliża się do 50:50, a na koniec łagodnie dochodzi do docelowych 75%.
// Do tego dochodzi CAŁKOWITA prędkość (przed podziałem na osie) — ale tu
// wjazd i wyrzut MUSZĄ się różnić: wjazd kończy się lądowaniem karty na
// docelowym miejscu, więc ma sens, żeby zwalniała do zera na końcu (klasyczna
// parabola, której całka to znana krzywa ease-in-out). Wyrzut natomiast ma
// kartę definitywnie wynieść poza ekran — gdyby też zwalniała do zera na
// końcu, oś o mniejszym udziale w końcówce (np. X, któremu zostaje tylko
// 25%) zdążyłaby "wyczerpać" swój dystans dużo wcześniej niż druga i przez
// resztę animacji ledwo by drgała — to właśnie dawało wrażenie "niewidzialnej
// ściany" i zatrzymania kawałek poza ekranem. Dlatego wyrzut używa krzywej
// narastającej (ease-in, bez zwalniania na końcu) — karta cały czas
// przyspiesza, aż znika z ekranu.
const SHARE_SAMPLES = 200;

// 0 -> 1, szybka zmiana zaraz po starcie, spowalniająca w miarę zbliżania
// się do 1 (kwadratowe ease-out) — to ten kształt daje "tuż po rozpoczęciu"
// szybkie przejście do 25%, a dopiero potem wolniejsze dojście do 50% i 75%.
function shareShape(t: number) {
  return 2 * t - t * t;
}

// Wjazd: symetryczna parabola (zero -> szczyt -> zero) — łagodny start i
// łagodne lądowanie na docelowym miejscu.
function enterSpeedProfile(t: number) {
  return 6 * t * (1 - t);
}

// Wyrzut: narasta przez całą animację, bez zwalniania na końcu — karta cały
// czas przyspiesza aż znika z ekranu, zamiast dobiegać i zatrzymywać się przy
// krawędzi. W przeciwieństwie do wjazdu NIE zaczyna się od zera: w chwili
// puszczenia palca karta ma już jakąś realną prędkość (z przeciągania), więc
// wymuszenie zerowej prędkości na starcie animacji (t=0) dawało wyczuwalne
// "zerwanie" ruchu — Y, które jeszcze przed puszczeniem trochę "jechało" za
// palcem, nagle zamierało na moment, zanim X zdążył wystartować. Start od
// niezerowej wartości bazowej usuwa tę martwą chwilę.
function exitSpeedProfile(t: number) {
  return 0.4 + 1.6 * t;
}

// Buduje model jednej osi: gotową funkcję "easing" (t: 0..1 -> 0..1, całkując
// w czasie udział tej osi w prędkości i normalizując tak, by kończyła się
// dokładnie na 1) ORAZ jej "rawTotal" — sumę SPRZED tej normalizacji.
// hShareStart/hShareEnd to udział POZIOMU w prędkości na starcie/końcu
// animacji (udział pionu to zawsze dopełnienie do 1); speedProfile to kształt
// CAŁKOWITEJ prędkości w czasie (przed podziałem na osie).
//
// rawTotal jest kluczowe przy wyrzucie: X i Y mają z natury BARDZO różne
// docelowe dystanse (55% szerokości vs 105% wysokości ekranu). Gdyby każdą
// oś niezależnie "rozciągnąć" tak, by zaczynała w miejscu puszczenia karty i
// kończyła dokładnie na swoim (stałym) dystansie, RZECZYWISTA prędkość w
// pikselach na sekundę i tak byłaby zdominowana przez oś o większym
// dystansie (Y) przez większość animacji, niezależnie od zaplanowanego
// udziału — to właśnie dawało wrażenie "karta zatrzymuje się w poziomie i
// dalej porusza się już tylko pionowo". rawTotal pozwala zamiast tego
// wyliczyć jeden wspólny mnożnik (scale, patrz performSwipe), który
// przelicza oba dystanse tak, by RZECZYWISTY stosunek prędkości między
// osiami dokładnie odpowiadał zaplanowanemu udziałowi przez cały czas
// trwania animacji.
function buildAxisModel(
  hShareStart: number,
  hShareEnd: number,
  axis: 'x' | 'y',
  speedProfile: (t: number) => number
) {
  const samples: number[] = [0];
  let cumulative = 0;
  for (let i = 1; i <= SHARE_SAMPLES; i++) {
    const t = i / SHARE_SAMPLES;
    const prevT = (i - 1) / SHARE_SAMPLES;
    const midT = (t + prevT) / 2;
    const hFrac = hShareStart + (hShareEnd - hShareStart) * shareShape(midT);
    const axisFrac = axis === 'x' ? hFrac : 1 - hFrac;
    const totalSpeed = speedProfile(midT);
    cumulative += axisFrac * totalSpeed * (1 / SHARE_SAMPLES);
    samples.push(cumulative);
  }
  const rawTotal = samples[samples.length - 1] || 1e-6;
  const normalized = samples.map((v) => v / rawTotal);

  const easing = (t: number) => {
    const clamped = Math.min(Math.max(t, 0), 1);
    const pos = clamped * SHARE_SAMPLES;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, SHARE_SAMPLES);
    const frac = pos - i0;
    return normalized[i0] + (normalized[i1] - normalized[i0]) * frac;
  };

  return { easing, rawTotal };
}

// Wjazd nowej karty: 100% pion -> 75% poziom / 25% pion. Dystanse (X i Y) są
// tu ustalone niezależnie (patrz ENTER_HORIZONTAL_RATIO/ENTER_VERTICAL_RATIO)
// — uproszczenie zaakceptowane, bo wjazd wygląda dobrze w praktyce.
const enterXModel = buildAxisModel(0, 0.75, 'x', enterSpeedProfile);
const enterYModel = buildAxisModel(0, 0.75, 'y', enterSpeedProfile);
const enterXEasing = enterXModel.easing;
const enterYEasing = enterYModel.easing;

// Wyrzut karty po swipe: ~92% poziom -> 75% pion / 25% poziom — udziałowo
// niemal dokładna odwrotność wjazdu (0.92 zamiast pełnego 1 na starcie), z
// NARASTAJĄCĄ, a nie zwalniającą prędkością całkowitą (patrz komentarz przy
// exitSpeedProfile). Start ustawiony na 0.92, nie na twarde 1 (czyli "0%
// pionu"), z tego samego powodu co niezerowa exitSpeedProfile: w chwili
// puszczenia karta zwykle już trochę "jechała" w pionie za palcem (patrz
// curveY w handleGestureEvent), więc pion od razu dostaje niewielki, ciągły
// udział zamiast być na starcie sztucznie wyzerowany.
// Tu, w przeciwieństwie do wjazdu, docelowe dystanse X/Y NIE są ustalone
// niezależnie — liczy je performSwipe na podstawie rawTotal, żeby zachować
// prawdziwy stosunek prędkości między osiami (patrz komentarz przy
// buildAxisModel).
const exitXModel = buildAxisModel(0.92, 0.25, 'x', exitSpeedProfile);
const exitYModel = buildAxisModel(0.92, 0.25, 'y', exitSpeedProfile);
const exitXEasing = exitXModel.easing;
const exitYEasing = exitYModel.easing;

// Cofnięcie (Cofnij): karta ma "wracać" z tej samej strony, w którą ją
// pierwotnie przesunięto — czysto poziomy zjazd do środka, bez łuku pionowego.
const UNDO_RETURN_DURATION = 260;

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

    Animated.parallel([
      // Pion i poziom sterowane wspólnym modelem udziału osi w prędkości
      // (patrz komentarz przy buildAxisEasing) — na starcie ruch niemal w
      // całości pionowy, z każdą chwilą coraz większy udział poziomu, aż do
      // 75%/25% na końcu.
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: ENTER_DURATION,
        easing: enterYEasing,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateX, {
        toValue: 0,
        duration: ENTER_DURATION,
        easing: enterXEasing,
        useNativeDriver: true,
      }),
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
    const minTargetX = direction === 'left' ? -offsetX : offsetX;
    const minTargetY = offsetY;
    // Cel animacji nie może być BLIŻEJ środka niż miejsce, w którym użytkownik
    // faktycznie puścił kartę — w przeciwnym razie (przy bardzo mocnym
    // przeciągnięciu, dalej niż standardowy dystans wyrzutu) Animated.timing
    // animowałby WSTECZ, od bieżącej (dalszej) pozycji do bliższego celu, co
    // wyglądało jak odbicie karty z powrotem na ekran. Cel zawsze co najmniej
    // tak daleki jak pozycja puszczenia — animacja kontynuuje ruch w tym
    // samym kierunku, nigdy go nie odwraca.
    const minAbsTargetX = direction === 'left' ? Math.min(minTargetX, startX) : Math.max(minTargetX, startX);
    const minAbsTargetY = Math.max(minTargetY, startY);
    const neededDx = Math.abs(minAbsTargetX - startX);
    const neededDy = Math.max(minAbsTargetY - startY, 0);

    // X i Y mają z natury bardzo różne wymagane dystanse (patrz komentarz
    // przy buildAxisModel) — jeden wspólny mnożnik "scale" rozciąga OBA
    // dystanse tak, by żaden nie wypadł krócej niż potrzeba, zachowując przy
    // tym dokładnie zaplanowany, rzeczywisty (w pikselach) stosunek prędkości
    // między osiami przez całą animację. Oś, dla której to "trudniejszy"
    // warunek (zwykle Y — dużo większy dystans), wyznacza tempo; druga
    // (zwykle X) po prostu przeleci dalej niż jej minimalny wymagany dystans,
    // co jest wizualnie niegroźne (dodatkowy margines poza ekranem).
    const scale = Math.max(neededDx / exitXModel.rawTotal, neededDy / exitYModel.rawTotal);
    const travelX = scale * exitXModel.rawTotal;
    const travelY = scale * exitYModel.rawTotal;
    const targetX = startX + (direction === 'left' ? -travelX : travelX);
    const targetY = startY + travelY;

    // Dystans i czas trwania liczone od RZECZYWISTEJ pozycji puszczenia karty
    // do celu (nie od środka) — im dalej użytkownik już ją przeciągnął, tym
    // krócej trwa dokończenie wyrzutu.
    const distance = Math.hypot(targetX - startX, targetY - startY);
    const speed = Math.max(Math.hypot(velocityX, velocityY), FLING_MIN_SPEED);
    const duration = clamp((distance / speed) * 1000, MIN_EXIT_DURATION, MAX_EXIT_DURATION);

    // Ten sam model udziału osi w prędkości co przy wjeździe (animateEntrance),
    // tylko odwrócony: start niemal w całości poziomo, z każdą chwilą coraz
    // większy udział pionu, aż do 75%/25% na końcu — w momencie, w którym
    // karta w zasadzie znika z ekranu.
    Animated.parallel([
      Animated.timing(cardTranslateX, {
        toValue: targetX,
        duration,
        easing: exitXEasing,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: targetY,
        duration,
        easing: exitYEasing,
        useNativeDriver: true,
      }),
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
