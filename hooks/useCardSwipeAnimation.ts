import { useMemo, useRef } from 'react';
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
// Górny "sufit" prędkości gestu branej pod uwagę — bez tego bardzo szybkie,
// mocne przesunięcie palcem dawało NIEPROPORCJONALNIE szybki wyrzut karty
// (czas trwania animacji spadał praktycznie bez dolnego ograniczenia razem z
// rosnącą prędkością rzutu). Realna prędkość gestu powyżej tego progu jest
// traktowana tak samo jak dokładnie ten próg — dalsze przyspieszanie ruchu
// palca nie przyspiesza już animacji.
const FLING_MAX_SPEED = 1500;

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
// palcem, nagle zamierało na moment, zanim X zdążył wystartować.
//
// Zamiast jednej stałej (ta sama dla każdego swipe'a), start animacji jest
// TERAZ wyliczany z RZECZYWISTEJ prędkości gestu w chwili puszczenia —
// zarówno JEJ KIERUNEK (ile realnie było poziomu, a ile pionu), jak i JEJ
// WARTOŚĆ (jak "rozpędzona" była karta) stają się danymi wejściowymi, a nie
// założeniem z góry. Patrz computeExitAxisModels.
const EXIT_H_SHARE_MIN = 0.55; // nigdy mniej niż 55% poziomo na starcie — to nadal decyzja lewo/prawo
const EXIT_H_SHARE_MAX = 0.95; // nigdy pełne 100% — twardy zera pionu dawał "zerwanie" ruchu (patrz wyżej)
const EXIT_START_FRACTION_MIN = 0.2; // bardzo wolne puszczenie -> łagodny, ale nie zerowy start
const EXIT_START_FRACTION_MAX = 0.9; // bardzo mocny rzut -> start niemal tak szybki jak koniec (prawie stała prędkość)
const EXIT_REFERENCE_FLING_SPEED = 1200; // px/s uznawane za "mocny, zdecydowany rzut"

// Buduje modele osi X/Y dla TEGO KONKRETNEGO wyrzutu, na podstawie realnej
// prędkości gestu w chwili puszczenia (velocityX/velocityY z eventu gestu):
//
// 1. Kierunek startowy (hShareStart) = rzeczywisty kierunek prędkości
//    puszczenia (|vx|/|v|), a nie sztywna liczba. Delikatny, powolny swipe
//    (mała prędkość pionowa z przeciągania) i tak wyjdzie blisko górnego
//    limitu (prawie w pełni poziomo) — model sam się dostosowuje, zamiast
//    zgadywać jedną wartość dla wszystkich przypadków. Ograniczone do
//    [EXIT_H_SHARE_MIN, EXIT_H_SHARE_MAX], żeby nigdy nie wypaść w skrajność.
// 2. "Rozpęd" startowy (startFraction, czyli jak blisko końcowej prędkości
//    zaczyna animacja) = realna wartość prędkości gestu względem przyjętego
//    punktu odniesienia "mocnego rzutu". Bardzo wolne puszczenie dostaje
//    łagodny start (bliżej MIN) — dopuszczalne odstępstwo, bo taki swipe i
//    tak nie miał dużego rozpędu. Bardzo mocny rzut dostaje start bliski
//    końcowej prędkości (MAX) — karta leci "od razu" tak szybko, jak leciała
//    pod palcem, zamiast się na nowo rozpędzać.
function computeExitAxisModels(velocityX: number, velocityY: number) {
  const speedMag = Math.hypot(velocityX, velocityY);

  const rawHShare = speedMag > 1 ? Math.abs(velocityX) / speedMag : EXIT_H_SHARE_MAX;
  const hShareStart = clamp(rawHShare, EXIT_H_SHARE_MIN, EXIT_H_SHARE_MAX);

  const startFraction = clamp(speedMag / EXIT_REFERENCE_FLING_SPEED, EXIT_START_FRACTION_MIN, EXIT_START_FRACTION_MAX);
  const speedProfile = (t: number) => startFraction + (1 - startFraction) * t;

  return {
    x: buildAxisModel(hShareStart, 0.25, 'x', speedProfile),
    y: buildAxisModel(hShareStart, 0.25, 'y', speedProfile),
  };
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

// Wyrzut karty po swipe: model X/Y liczony ODDZIELNIE dla każdego swipe'a w
// performSwipe (patrz computeExitAxisModels) — start ~55–95% poziomo (koniec
// zawsze 25%) i tempo startowe zależą od realnej prędkości gestu w chwili
// puszczenia, a nie ze stałych wartości. Tu, w przeciwieństwie do wjazdu,
// docelowe dystanse X/Y też NIE są ustalone niezależnie — liczy je
// performSwipe na podstawie rawTotal, żeby zachować prawdziwy stosunek
// prędkości między osiami (patrz komentarz przy buildAxisModel).

// Cofnięcie (Cofnij): zamiast osobnej, uproszczonej animacji, karta odtwarza
// OD TYŁU faktyczną animację wyrzutu tej konkretnej karty (tę samą krzywą
// udziału osi i tempa, którą naprawdę wykonała przy swipe'owaniu) — stąd
// zapamiętujemy ostatnie MAX_UNDO_HISTORY wyrzutów (tyle, ile maksymalnie
// można cofnąć — patrz MAX_UNDOS_PER_SWIPE w app/swipe.tsx). Poniższy
// UNDO_RETURN_DURATION zostaje tylko jako czas awaryjnej, uproszczonej
// animacji, gdy z jakiegoś powodu nie ma nic w historii (np. świeże
// uruchomienie hooka bez wcześniejszego swipe'a w tej sesji).
const UNDO_RETURN_DURATION = 260;
const MAX_UNDO_HISTORY = 5;
// Historia kierunków wjazdu ma o jeden wpis więcej niż historia wyrzutów: w
// każdej chwili istnieje jedna "obecna" karta, która już wjechała, ale
// jeszcze nie została wyrzucona (i tak np. zaraz po starcie appki, zanim
// jakikolwiek swipe w ogóle się wydarzy) — patrz enterDirectionHistoryRef.
const MAX_ENTER_HISTORY = MAX_UNDO_HISTORY + 1;

// Zamienia funkcję "easing" (0..1 -> 0..1, opisującą jak pozycja rośnie od
// startu do celu w czasie) na jej odtworzenie WSTECZ: to, co easing robił w
// chwili (1 - t), reverseEasing robi w chwili t, tylko "od drugiej strony" —
// czyli klatka po klatce dokładnie ten sam ruch, ale odtworzony od końca do
// początku. Dzięki temu cofnięcie karty nie jest osobno wymyśloną animacją,
// tylko tą samą, naprawdę wykonaną krzywą ruchu, puszczoną od tyłu.
function reverseEasing(easing: (t: number) => number) {
  return (t: number) => 1 - easing(1 - t);
}

// Dystans pionowy wyjazdu DOTYCHCZASOWEJ karty przy cofnięciu (patrz
// animateUndoReturn) — WIĘKSZY niż ENTER_VERTICAL_RATIO używane przez
// zwykły wjazd/wyrzut. Offsety ENTER_*/EXIT_* są liczone względem WYSOKOŚCI
// SAMEGO cardArea (obszaru karty), nie całego ekranu — nad cardArea jest
// jeszcze nagłówek (strzałka wstecz, Match!'ed/Filtry), więc "pełne zejście
// poza granice cardArea" wcale nie znaczy "pełne zejście poza fizyczny
// ekran". Przy zwykłym wjeździe/wyrzucie to niezauważalne, bo to tylko
// KRÓTKA, przejściowa klatka startowa/końcowa w pełnym ruchu. Tu jednak
// karta ma na tej pozycji ZOSTAĆ (i dopiero po chwili zniknąć — patrz
// setTimeout niżej), więc każdy fragment wciąż mieszczący się w obszarze
// nagłówka był wyraźnie widoczny. Większy mnożnik gwarantuje zejście poza
// fizyczny ekran, niezależnie od wysokości nagłówka. Próba z 1.5 (mniejsze
// przyspieszenie pod koniec animacji, bo przy STAŁYM czasie trwania —
// ENTER_DURATION — mniejszy dystans = wolniejszy ruch) nie dawała już
// pewnego pełnego zejścia poza ekran, więc zostajemy przy 2.4.
const LEAVING_EXIT_VERTICAL_RATIO = 2.4;

interface ExitHistoryEntry {
  targetX: number;
  targetY: number;
  duration: number;
  xEasing: (t: number) => number;
  yEasing: (t: number) => number;
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
  // Historia ostatnich wyrzutów (max. MAX_UNDO_HISTORY, najnowszy na końcu) —
  // patrz komentarz przy MAX_UNDO_HISTORY i reverseEasing wyżej.
  const exitHistoryRef = useRef<ExitHistoryEntry[]>([]);
  // Historia kierunków, z których wjeżdżały kolejne karty (patrz
  // MAX_ENTER_HISTORY) — każdy wjazd (animateEntrance) dokłada tu jeden wpis;
  // przy cofnięciu zdejmowany jest wpis NAJNOWSZY, czyli dokładnie ten, który
  // opisuje OBECNIE widoczną kartę — dzięki temu, nawet przy wielu cofnięciach
  // z rzędu, każda kolejna "odsłonięta" karta automatycznie ma pod ręką
  // WŁASNY, oryginalny kierunek wjazdu (ten sprzed jej własnego wyrzutu), a
  // nie kierunek karty, która właśnie ją zastępowała.
  const enterDirectionHistoryRef = useRef<Array<'left' | 'right'>>([]);
  // Druga, niezależna para wartości animowanych — używana WYŁĄCZNIE do
  // wyjazdu obecnie widocznej karty przy cofnięciu (patrz animateUndoReturn):
  // karta cofana i tak korzysta z głównych cardTranslateX/Y (bo staje się
  // nową "obecną" kartą), więc do jednoczesnego wyjazdu tej DOTYCHCZASOWEJ
  // karty potrzebna jest osobna, tymczasowa animowana pozycja.
  const leavingCardTranslateX = useRef(new Animated.Value(0)).current;
  const leavingCardTranslateY = useRef(new Animated.Value(0)).current;
  // Wyjazd przy cofnięciu nie jest decyzją użytkownika — tint/stemple tej
  // karty mają być zawsze wyłączone (stąd Animated.Value(0), nigdy nie
  // zmieniany).
  const leavingTintEnabled = useRef(new Animated.Value(0)).current;
  // Widoczność tej warstwy jest CELOWO animowaną wartością (nie zwykłym stanem
  // Reacta przekładanym na styl opacity przy każdym renderze) — karta bywała
  // "zamrażana" w połowie drogi, zanim zdążyła w pełni wyjechać poza ekran, co
  // wskazywało na to, że coś w trakcie trwania animacji przerywało jej ruch;
  // najbardziej prawdopodobnym podejrzanym było to, że warstwa ta jest
  // renderowana NA STAŁE (żeby uniknąć kosztu ponownego montowania — patrz
  // komentarz w app/swipe.tsx), więc KAŻDY, nawet niezwiązany rerender
  // ekranu Swipe (np. zmiana innego stanu) tworzył NOWY obiekt/tablicę stylu
  // dla tej warstwy — a to mogło zakłócać w danym momencie trwającą na niej
  // animację natywną (useNativeDriver). Trzymając widoczność jako WŁASNĄ
  // wartość Animated, sterowaną WYŁĄCZNIE z tego samego miejsca co pozycja
  // (i to w tej samej klatce), widoczność przestaje zależeć od cyklu
  // renderowania Reacta w ogóle.
  const leavingOpacity = useRef(new Animated.Value(0)).current;

  // Rotacja jako interpolacja z pozycji X danej karty — wydzielone do funkcji,
  // żeby ten sam wzór (patrz też użycie niżej) obsługiwał zarówno główną, jak
  // i "wyjeżdżającą" (leaving) kartę.
  const buildRotateInterpolate = (translateX: Animated.Value) => {
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
    return translateX.interpolate({
      inputRange: rotationInputRange,
      outputRange: rotationOutputRange,
      extrapolate: 'clamp',
    });
  };
  // KRYTYCZNE: zmemoizowane (useMemo), a NIE budowane od nowa przy każdym
  // renderze. `.interpolate(...)` tworzy nowy węzeł AnimatedInterpolation za
  // każdym wywołaniem — gdyby trafiał on do tablicy `transform` w
  // Animated.View przy KAŻDYM renderze (nawet niezwiązanym z tą kartą, np.
  // inny stan gdzieś w app/swipe.tsx), React Native musiałby przy każdym
  // takim renderze na nowo spinać CAŁY graf animowanych propsów tego widoku
  // (transform to jedna, złożona właściwość, łącząca translateX/Y I rotate)
  // — a to potrafi zerwać połączenie z natywnym sterownikiem (useNativeDriver)
  // dla animacji WŁAŚNIE trwającej na translateX/Y w tej samej tablicy
  // transform, zamrażając ją w połowie drogi. To najbardziej prawdopodobny
  // winowajca tego, że karta wyjeżdżająca przy cofnięciu zatrzymywała się w
  // połowie animacji. Przeliczane od nowa tylko wtedy, gdy realnie zmienią
  // się wymiary (areaSize/cardHeight), od których zależy geometria rotacji.
  const leavingRotateInterpolate = useMemo(
    () => buildRotateInterpolate(leavingCardTranslateX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaSize?.width, cardHeight]
  );

  const animateEntrance = (fromDirection: 'left' | 'right') => {
    isAnimatingRef.current = true;

    // Zapamiętaj, z której strony wjeżdża TA karta — potrzebne, gdyby została
    // później "wyprzedzona" cofnięciem (patrz enterDirectionHistoryRef i
    // animateUndoReturn).
    enterDirectionHistoryRef.current.push(fromDirection);
    if (enterDirectionHistoryRef.current.length > MAX_ENTER_HISTORY) {
      enterDirectionHistoryRef.current.shift();
    }

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

  // Cofnięcie poprzedniej decyzji — dzieje się teraz w DWÓCH częściach,
  // odtwarzanych RÓWNOLEGLE:
  // 1. Karta cofana (ta, która wraca do gry) odtwarza WSTECZ ostatnią
  //    zapamiętaną animację swojego wyrzutu (patrz exitHistoryRef/
  //    reverseEasing) — startuje dokładnie z miejsca, w którym naprawdę
  //    skończył się jej wyrzut, i tą samą krzywą (odtworzoną od tyłu) wraca
  //    na środek. Korzysta z GŁÓWNYCH cardTranslateX/Y, bo staje się nową
  //    "obecną" kartą.
  // 2. Karta dotychczas widoczna (ta, którą użytkownik właśnie oglądał)
  //    jednocześnie WYJEŻDŻA w stronę, z której sama kiedyś wjechała — też
  //    jako odtworzenie wstecz, tym razem swojej animacji wjazdu (ta sama dla
  //    każdej karty, więc wystarczy pamiętać tylko kierunek — patrz
  //    enterDirectionHistoryRef). Korzysta z osobnych, "leaving" wartości
  //    animowanych, bo wizualnie to inna, druga karta — wywołujący (patrz
  //    app/swipe.tsx) musi w tym czasie renderować ją osobno, z danymi
  //    filmu sprzed cofnięcia.
  // originalDirection zostaje jako sygnał na wypadek pustej historii wyrzutów
  // (np. świeże uruchomienie hooka bez wcześniejszego swipe'a) — wtedy
  // używana jest stara, uproszczona animacja jako awaryjny wariant.
  const animateUndoReturn = (
    originalDirection: 'left' | 'right',
    onOutgoingCardExitComplete: () => void = () => {}
  ) => {
    isAnimatingRef.current = true;
    tintEnabled.setValue(0);

    // Obie animacje (wyjazd dotychczasowej karty + powrót cofanej) muszą się
    // zakończyć, zanim isAnimatingRef wróci do false — stąd prosty licznik
    // "w toku": startuje od 1 (powrót cofanej karty zawsze się odbywa),
    // ewentualnie +1, gdy startuje też wyjazd dotychczasowej.
    let pending = 1;
    const finishOne = () => {
      pending -= 1;
      if (pending <= 0) {
        isAnimatingRef.current = false;
        tintEnabled.setValue(1);
      }
    };

    // Odczyt historii (same odczyty referencji, bez skutków wizualnych) może
    // zostać od razu — dopiero właściwe przestawienie wartości animowanych
    // jest odłożone o klatkę, patrz niżej.
    const outDirection = enterDirectionHistoryRef.current.pop();
    if (outDirection) {
      pending += 1;
    }
    const entry = exitHistoryRef.current.pop();

    // KLUCZOWE: samo wywołanie tej funkcji dzieje się SYNCHRONICZNIE w tym
    // samym cyklu co setOutgoingMovie/deck.goBack() w app/swipe.tsx (React
    // batchuje te zmiany stanu i wyrenderuje je DOPIERO po zakończeniu tego
    // wywołania). Gdyby cardTranslateX/Y (główna karta) zostały przestawione
    // na pozycję poza ekranem od razu tutaj, dotyczyłoby to jeszcze STAREJ,
    // aktualnie wyrenderowanej karty (z danymi filmu SPRZED cofnięcia) —
    // widocznie "teleportowałaby się" poza ekran zanim React zdąży
    // podmienić jej dane na film cofnięty ORAZ zamontować nakładkę z kartą
    // wyjeżdżającą (patrz outgoingMovie w app/swipe.tsx) — czyli dokładnie
    // to krótkie zniknięcie karty. requestAnimationFrame odkłada faktyczne
    // przestawienie i start animacji do chwili, gdy React zdąży już
    // wyrenderować i zamontować oba elementy (kartę z filmem cofniętym oraz
    // nakładkę wyjeżdżającą) — dopiero wtedy widać spójny, jednoczesny start
    // obu animacji, bez pośredniego "pustego" kadru.
    requestAnimationFrame(() => {
      // -- Część 1: dotychczasowa karta wyjeżdża w stronę, z której wjechała --
      if (outDirection) {
        const offsetX = (areaSize?.width || 400) * ENTER_HORIZONTAL_RATIO;
        // LEAVING_EXIT_VERTICAL_RATIO (nie ENTER_VERTICAL_RATIO) — patrz
        // komentarz przy tej stałej: karta ma tu naprawdę zejść poza
        // FIZYCZNY ekran, nie tylko poza obszar cardArea.
        const offsetY = (areaSize?.height || 700) * LEAVING_EXIT_VERTICAL_RATIO;
        const outTargetX = outDirection === 'left' ? offsetX : -offsetX;
        const outTargetY = -offsetY;

        leavingCardTranslateX.setValue(0);
        leavingCardTranslateY.setValue(0);
        // Widoczność startuje TERAZ, w tej samej klatce co pozycja — i, tak
        // jak pozycja, jest to wartość Animated, więc dalej NIC w tym całym
        // przejściu nie zależy od cyklu renderowania Reacta (patrz komentarz
        // przy leavingOpacity).
        leavingOpacity.setValue(1);

        Animated.parallel([
          Animated.timing(leavingCardTranslateX, {
            toValue: outTargetX,
            duration: ENTER_DURATION,
            easing: reverseEasing(enterXEasing),
            useNativeDriver: true,
          }),
          Animated.timing(leavingCardTranslateY, {
            toValue: outTargetY,
            duration: ENTER_DURATION,
            easing: reverseEasing(enterYEasing),
            useNativeDriver: true,
          }),
        ]).start(() => {
          finishOne();
        });
        // Ukrycie tej nakładki jest CELOWO NIEZALEŻNE od callbacku powyższej
        // animacji pozycji — przy useNativeDriver zdarzało się, że callback
        // ".start()" odpalał się, zanim naprawdę widać było na ekranie
        // ostatnią klatkę (karta znikała, gdy wciąż spora jej część była w
        // kadrze). setTimeout na dokładnie czas trwania (+ mały bufor)
        // gwarantuje, że opacity spadnie NIE WCZEŚNIEJ niż po pełnym czasie
        // animacji pozycji. Sama zmiana opacity też idzie przez Animated
        // (patrz leavingOpacity) zamiast przez stan Reacta/styl przeliczany
        // przy każdym renderze — dotychczasowe rozwiązanie (opacity sterowane
        // stanem outgoingMovie w app/swipe.tsx) mogło zostać zakłócone przez
        // KAŻDY, nawet niezwiązany rerender ekranu w trakcie trwania
        // animacji (nowy obiekt stylu = potencjalna okazja do przerwania
        // trwającej na tym widoku animacji natywnej).
        setTimeout(() => {
          leavingOpacity.setValue(0);
          onOutgoingCardExitComplete();
        }, ENTER_DURATION + 40);
      }

      // -- Część 2: karta cofana wraca (odtworzenie ostatniego wyrzutu wstecz) --
      if (entry) {
        cardTranslateX.setValue(entry.targetX);
        cardTranslateY.setValue(entry.targetY);

        Animated.parallel([
          Animated.timing(cardTranslateX, {
            toValue: 0,
            duration: entry.duration,
            easing: reverseEasing(entry.xEasing),
            useNativeDriver: true,
          }),
          Animated.timing(cardTranslateY, {
            toValue: 0,
            duration: entry.duration,
            easing: reverseEasing(entry.yEasing),
            useNativeDriver: true,
          }),
        ]).start(() => {
          finishOne();
        });
        return;
      }

      // Awaryjny wariant — brak zapamiętanej animacji wyrzutu w historii.
      const offsetX = (areaSize?.width || 400) * EXIT_HORIZONTAL_RATIO;
      cardTranslateX.setValue(originalDirection === 'left' ? -offsetX : offsetX);
      cardTranslateY.setValue(0);

      Animated.timing(cardTranslateX, {
        toValue: 0,
        duration: UNDO_RETURN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        finishOne();
      });
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

    // Prędkość gestu ograniczona od góry (patrz FLING_MAX_SPEED) — KIERUNEK
    // zostaje ten sam co w realnym geście, ale wartość ponad ten próg nie
    // przyspiesza animacji dalej. Ta sama, jedna "efektywna" prędkość napędza
    // zarówno model osi (kierunek/rozpęd startowy), jak i czas trwania —
    // dzięki temu obie rzeczy są ze sobą spójne.
    const rawSpeed = Math.hypot(velocityX, velocityY);
    const cappedSpeed = clamp(rawSpeed, 0, FLING_MAX_SPEED);
    const speedScale = rawSpeed > 0 ? cappedSpeed / rawSpeed : 0;
    const effVelocityX = velocityX * speedScale;
    const effVelocityY = velocityY * speedScale;

    // Model TEGO KONKRETNEGO wyrzutu — kierunek i "rozpęd" startowy wyliczone
    // z efektywnej prędkości gestu w chwili puszczenia (patrz komentarz przy
    // computeExitAxisModels), więc animacja płynnie kontynuuje to, co robił
    // palec, zamiast zakładać z góry jeden uniwersalny kształt.
    const exitModels = computeExitAxisModels(effVelocityX, effVelocityY);

    // X i Y mają z natury bardzo różne wymagane dystanse (patrz komentarz
    // przy buildAxisModel) — jeden wspólny mnożnik "scale" rozciąga OBA
    // dystanse tak, by żaden nie wypadł krócej niż potrzeba, zachowując przy
    // tym dokładnie zaplanowany, rzeczywisty (w pikselach) stosunek prędkości
    // między osiami przez całą animację. Oś, dla której to "trudniejszy"
    // warunek (zwykle Y — dużo większy dystans), wyznacza tempo; druga
    // (zwykle X) po prostu przeleci dalej niż jej minimalny wymagany dystans,
    // co jest wizualnie niegroźne (dodatkowy margines poza ekranem).
    const scale = Math.max(neededDx / exitModels.x.rawTotal, neededDy / exitModels.y.rawTotal);
    const travelX = scale * exitModels.x.rawTotal;
    const travelY = scale * exitModels.y.rawTotal;
    const targetX = startX + (direction === 'left' ? -travelX : travelX);
    const targetY = startY + travelY;

    // Dystans i czas trwania liczone od RZECZYWISTEJ pozycji puszczenia karty
    // do celu (nie od środka) — im dalej użytkownik już ją przeciągnął, tym
    // krócej trwa dokończenie wyrzutu.
    const distance = Math.hypot(targetX - startX, targetY - startY);
    const speed = Math.max(cappedSpeed, FLING_MIN_SPEED);
    const duration = clamp((distance / speed) * 1000, MIN_EXIT_DURATION, MAX_EXIT_DURATION);

    // Zapamiętaj tę animację na potrzeby ewentualnego cofnięcia (patrz
    // animateUndoReturn) — historia ograniczona do MAX_UNDO_HISTORY (tyle,
    // ile maksymalnie można cofnąć), najstarsza pozycja odpada, gdy przybywa
    // nowa ponad ten limit.
    exitHistoryRef.current.push({
      targetX,
      targetY,
      duration,
      xEasing: exitModels.x.easing,
      yEasing: exitModels.y.easing,
    });
    if (exitHistoryRef.current.length > MAX_UNDO_HISTORY) {
      exitHistoryRef.current.shift();
    }

    Animated.parallel([
      Animated.timing(cardTranslateX, {
        toValue: targetX,
        duration,
        easing: exitModels.x.easing,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: targetY,
        duration,
        easing: exitModels.y.easing,
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
  // Zmemoizowane z tego samego powodu co leavingRotateInterpolate wyżej —
  // patrz komentarz tam.
  const rotateInterpolate = useMemo(
    () => buildRotateInterpolate(cardTranslateX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaSize?.width, cardHeight]
  );

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
    // Druga karta (dotychczas widoczna, wyjeżdżająca przy cofnięciu) — patrz
    // komentarz przy leavingCardTranslateX i animateUndoReturn.
    leavingCardTranslateX,
    leavingCardTranslateY,
    leavingRotateInterpolate,
    leavingTintEnabled,
    leavingOpacity,
  };
}
