import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { GENRES } from '../../constants/genres';
import { useAuthStore } from '../../store/useAuthStore';
import { useConnectionsStore } from '../../store/useConnectionsStore';
import { useMatchesStore } from '../../store/useMatchesStore';
import { useMatchNotificationStore } from '../../store/useMatchNotificationStore';
import { useMovieStore } from '../../store/useMovieStore';

const GRID_COLUMNS = 2;
// +20% względem oryginalnych 80px.
const AVATAR_SIZE = 96;
const AVATAR_BLOCK_MIN_WIDTH = AVATAR_SIZE + 24;
// Maks. długość nicku (patrz onboarding.tsx) — używana do wyliczenia miejsca
// pod avatarem, żeby najdłuższy możliwy nick zawsze zmieścił się w całości.
const USERNAME_MAX_LENGTH = 'ciasteczka_i_jednorozce'.length;

// "Główne przyciski" (strzałki, przycisk gatunku, Znajomi, Match!'ed).
const CATEGORY_PADDING_H = 30;
const CATEGORY_PADDING_V = 18;
const CATEGORY_FONT_SIZE = 22;
// Różnica względem pełnego rozmiaru (1.0) zmniejszona o połowę: było 0.75 (różnica
// 0.25), teraz różnica 0.125 => 0.875.
const SMALL_PILL_SCALE = 0.875;
// Bufor bezpieczeństwa dodawany do zmierzonej szerokości nazwy gatunku — sam pomiar
// bywa odrobinę zaniżony (np. zanim doczyta się finalna czcionka), więc bez tego
// zapasu tekst potrafił się przycinać mimo pozornie wolnego miejsca na przycisku.
const CATEGORY_TEXT_SAFETY_BUFFER = 16;
const STACK_GAP = 8;
// Przybliżone wysokości pigułek — liczone z paddingu i rozmiaru czcionki, żeby
// dało się wyliczyć pozycję środkowego przycisku (Match!'ed) bez pomiaru w locie.
const LINE_HEIGHT_FACTOR = 1.25;
const GENRE_BUTTON_HEIGHT = CATEGORY_PADDING_V * 2 + CATEGORY_FONT_SIZE * LINE_HEIGHT_FACTOR;
const STACK_PILL_HEIGHT =
  CATEGORY_PADDING_V * SMALL_PILL_SCALE * 2 + CATEGORY_FONT_SIZE * SMALL_PILL_SCALE * LINE_HEIGHT_FACTOR;
const TOTAL_STACK_HEIGHT = STACK_PILL_HEIGHT * 2 + STACK_GAP * 2 + GENRE_BUTTON_HEIGHT;
// Odstęp napisu "Dotknij, by wybrać z listy" od przycisku gatunku POWYŻEJ
// niego i od przycisku rozpoczęcia swipe'a PONIŻEJ niego — ten sam dystans w
// obie strony (symetrycznie), zamiast dawnego, znacznie większego odstępu
// wynikającego z wyśrodkowania przycisku w całej pozostałej przestrzeni.
const HINT_GAP = 14;
// Punkt odniesienia = granica (środek przerwy) między pigułką Znajomi a Match!'ed.
const OFFSET_TO_STACK_BOUNDARY = STACK_PILL_HEIGHT + STACK_GAP / 2;

// Float avatarów: bazowa prędkość (czas jednej "połówki" ruchu góra/dół) i zasięg.
const BASE_FLOAT_DURATION = 3200;
const BASE_FLOAT_AMPLITUDE = 7;

// Każdy avatar dostaje własne, lekko odchylone (±10%) tempo i zasięg ruchu,
// wylosowane od nowa za każdym razem, gdy zmienia się `resetKey` (np. zmiana
// aktywnego znajomego) — plus losowy punkt startowy w cyklu ruchu.
function useFloatAnimation(resetKey: string) {
  const params = useMemo(() => {
    const durationVariance = 1 + (Math.random() * 0.2 - 0.1);
    const amplitudeVariance = 1 + (Math.random() * 0.2 - 0.1);
    return {
      duration: BASE_FLOAT_DURATION * durationVariance,
      amplitude: BASE_FLOAT_AMPLITUDE * amplitudeVariance,
      startPhase: Math.random(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const anim = useRef(new Animated.Value(params.startPhase)).current;

  useEffect(() => {
    anim.setValue(params.startPhase);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: params.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: params.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      // Kluczowe: bez tego Animated.loop domyślnie "cofa" wartość do stanu sprzed
      // pierwszej iteracji przy starcie KAŻDEJ kolejnej pętli. Ponieważ startujemy
      // z losowej fazy (startPhase), a nie od 0, to domyślne zachowanie powodowało
      // gwałtowny "skok" raz na cykl. Wyłączenie resetu pozwala płynnie kontynuować
      // od wartości, na której sekwencja faktycznie się zakończyła (zawsze 0).
      { resetBeforeIteration: false }
    );
    loop.start();
    return () => loop.stop();
  }, [anim, params]);

  return anim.interpolate({ inputRange: [0, 1], outputRange: [-params.amplitude, params.amplitude] });
}

// Animacja "wciśnięcia" dla głównych przycisków (strzałki, Znajomi, Match!'ed,
// przycisk przejścia do swipe'a) — delikatne zmniejszenie po dotknięciu i
// sprężyste odbicie po puszczeniu, czysto wizualny feedback.
const PRESS_SCALE_DOWN = 0.92;
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: PRESS_SCALE_DOWN, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };
  return { scale, onPressIn, onPressOut };
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  const profile = useAuthStore((s) => s.profile);
  const myId = useAuthStore((s) => s.session?.user.id) ?? null;
  const partners = useConnectionsStore((s) => s.partners);
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const hasUnseenMatch = useMatchNotificationStore((s) => s.hasUnseen(activeConnectionId));

  // Dopasowania dla aktywnego znajomego pobierane z wyprzedzeniem, w tle, od
  // razu jak tylko znamy activeConnectionId — zanim jeszcze ktoś wciśnie
  // "Match!'ed" — żeby ten ekran był gotowy do pokazania od razu.
  const matchesReady = useMatchesStore((s) => s.ready && s.connectionId === activeConnectionId);
  const prefetchMatches = useMatchesStore((s) => s.prefetch);
  const [matchNavPending, setMatchNavPending] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    if (activeConnectionId && myId) {
      prefetchMatches(activeConnectionId, myId);
    }
  }, [activeConnectionId, myId, prefetchMatches]);

  // Ekran Match!'ed otwiera się dopiero, gdy jego dane są w 100% gotowe —
  // jeśli prefetch w tle jeszcze nie skończył, doczekujemy go tutaj (krótki
  // spinner na przycisku), zamiast wchodzić na ekran i doładowywać kafelki
  // dopiero po wejściu.
  const goToMatched = async () => {
    if (!matchesReady && activeConnectionId && myId) {
      setMatchNavPending(true);
      await prefetchMatches(activeConnectionId, myId);
      setMatchNavPending(false);
    }
    router.push('/matched');
  };

  const activePartner = partners.find((p) => p.connectionId === activeConnectionId);

  // Losowa strona (lewa/prawa) dla "moje" vs "znajomego" — bez stałej reguły kto
  // gdzie. Losowane raz na wejście na ekran (montaż komponentu).
  const [ownOnLeft] = useState(() => Math.random() < 0.5);

  // Animacje float — resetują się (nowe tempo/zasięg/faza) przy zmianie aktywnego znajomego.
  const floatResetKey = activeConnectionId ?? 'none';
  const ownFloatY = useFloatAnimation(`own-${floatResetKey}`);
  const friendFloatY = useFloatAnimation(`friend-${floatResetKey}`);

  const lastGenreId = useMovieStore((s) => s.lastGenreId);
  const setLastGenreId = useMovieStore((s) => s.setLastGenreId);

  const [genreIndex, setGenreIndex] = useState(0);
  const [gridVisible, setGridVisible] = useState(false);
  const currentGenre = GENRES[genreIndex];

  // Ostatnio wybrany gatunek ma przetrwać restart appki. useMovieStore
  // rehydratuje się z AsyncStorage asynchronicznie, więc przy pierwszym
  // renderze `lastGenreId` bywa jeszcze `null` mimo zapisanej wartości na
  // dysku — czekamy na zakończenie hydracji, zanim zdecydujemy, czy jest co
  // zastosować. Dopiero PO tej jednorazowej decyzji zaczynamy sami zapisywać
  // zmiany gatunku, żeby nie nadpisać zapamiętanego wyboru domyślnym (0),
  // zanim hydracja zdąży się zakończyć.
  const [movieStoreHydrated, setMovieStoreHydrated] = useState(() => useMovieStore.persist.hasHydrated());
  useEffect(() => {
    if (movieStoreHydrated) return;
    if (useMovieStore.persist.hasHydrated()) {
      setMovieStoreHydrated(true);
      return;
    }
    return useMovieStore.persist.onFinishHydration(() => setMovieStoreHydrated(true));
  }, [movieStoreHydrated]);

  const appliedLastGenreRef = useRef(false);
  useEffect(() => {
    if (!movieStoreHydrated || appliedLastGenreRef.current) return;
    appliedLastGenreRef.current = true;
    if (lastGenreId != null) {
      const idx = GENRES.findIndex((g) => g.id === lastGenreId);
      if (idx !== -1) setGenreIndex(idx);
    }
  }, [movieStoreHydrated, lastGenreId]);

  useEffect(() => {
    if (!appliedLastGenreRef.current) return;
    setLastGenreId(currentGenre.id);
  }, [currentGenre.id, setLastGenreId]);

  // Zmierz szerokość każdej nazwy gatunku raz (niewidocznie), żeby ustalić stałą
  // szerokość przycisku = szerokość najdłuższego wariantu + padding.
  const [maxNameWidth, setMaxNameWidth] = useState(0);
  const measuredWidths = useRef<Record<number, number>>({});
  const onMeasureName = (id: number, width: number) => {
    measuredWidths.current[id] = width;
    if (Object.keys(measuredWidths.current).length === GENRES.length) {
      const max = Math.max(...Object.values(measuredWidths.current));
      setMaxNameWidth((prev) => (prev === max ? prev : max));
    }
  };
  const categoryButtonWidth =
    maxNameWidth > 0 ? maxNameWidth + CATEGORY_TEXT_SAFETY_BUFFER + CATEGORY_PADDING_H * 2 : undefined;
  const smallPillWidth = categoryButtonWidth ? categoryButtonWidth * SMALL_PILL_SCALE : undefined;

  // Lekkie "drganie" przycisku gatunku przy przewijaniu strzałkami — czysto
  // dekoracyjny feedback, nie wpływa na logikę wyboru gatunku.
  const genreShake = useRef(new Animated.Value(0)).current;
  const triggerGenreShake = () => {
    genreShake.setValue(0);
    Animated.sequence([
      Animated.timing(genreShake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(genreShake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(genreShake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };
  const genreShakeTranslateX = genreShake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] });

  const goPrev = () => {
    setGenreIndex((i) => (i - 1 + GENRES.length) % GENRES.length);
    triggerGenreShake();
  };
  const goNext = () => {
    setGenreIndex((i) => (i + 1) % GENRES.length);
    triggerGenreShake();
  };

  // Swipe w lewo/prawo na nazwie kategorii = to samo co strzałki (tylko przewija
  // podgląd, nie odpala jeszcze sesji). Start swipe'owania następuje dopiero po
  // wybraniu gatunku w siatce 2x5 albo po wciśnięciu okrągłego przycisku poniżej.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -40) goNext();
        else if (gesture.dx >= 40) goPrev();
      },
    })
  ).current;

  // Wybranie gatunku z pełnej listy (siatka) tylko ustawia go jako wybrany na
  // przycisku — NIE przenosi do swipe'a. Do swipe'a wchodzi się wyłącznie
  // osobnym, okrągłym przyciskiem poniżej.
  const selectGenre = (genre: (typeof GENRES)[number]) => {
    const idx = GENRES.findIndex((g) => g.id === genre.id);
    if (idx !== -1) setGenreIndex(idx);
    setGridVisible(false);
  };

  const prevArrowPress = usePressScale();
  const nextArrowPress = usePressScale();
  const znajomiPress = usePressScale();
  const matchPress = usePressScale();
  const swipeBtnPress = usePressScale();

  const goToSwipe = () => {
    router.push({ pathname: '/swipe', params: { genreId: currentGenre.id, genreName: currentGenre.name } });
  };

  const rows: (typeof GENRES)[] = [];
  for (let i = 0; i < GENRES.length; i += GRID_COLUMNS) {
    rows.push(GENRES.slice(i, i + GRID_COLUMNS));
  }

  // Miejsce pod nick: zmierzone raz na podstawie najszerszego możliwego nicku
  // (same litery "M" o długości maksymalnego nicku). WAŻNE: szerokość nicku NIE
  // wpływa na pozycję avatarów (patrz niżej) — nick jest pozycjonowany osobno,
  // na sztywno wyśrodkowany pod avatarem, żeby odstępy avatarów zostały dokładnie
  // 1-2-1 niezależnie od długości nicków.
  const [nicknameMaxWidth, setNicknameMaxWidth] = useState(0);
  const nicknameWidth = nicknameMaxWidth || AVATAR_BLOCK_MIN_WIDTH;
  // Uwaga: to "left" liczy się względem bezpośredniego rodzica (Animated.View
  // opakowującego avatar), a jego szerokość to AVATAR_SIZE — nie szerokość całego
  // bloku (AVATAR_BLOCK_MIN_WIDTH). Liczenie względem złej szerokości było
  // przyczyną niewyśrodkowanego nicku.
  const nicknamePositionStyle = {
    position: 'absolute' as const,
    top: AVATAR_SIZE + AVATAR_SIZE * 0.2,
    left: AVATAR_SIZE / 2 - nicknameWidth / 2,
    width: nicknameWidth,
  };

  // Avatary: odległość między nimi = 2x odległość każdego z nich od bocznej
  // krawędzi ekranu. W = 4*edgeGap + 2*AVATAR_SIZE  =>  edgeGap = (W - 2*AVATAR_SIZE) / 4.
  // Pozycja liczona zawsze na bazie stałej szerokości bloku (AVATAR_BLOCK_MIN_WIDTH) —
  // nick, choćby szerszy, nigdy tego nie zaburza.
  // Przesunięte niżej o połowę wysokości przycisku gatunku (GENRE_BUTTON_HEIGHT/2).
  const avatarRowTop = screenHeight / 3 - AVATAR_SIZE / 2 - screenHeight * 0.1 + GENRE_BUTTON_HEIGHT / 2;
  const edgeGap = Math.max(0, (screenWidth - 2 * AVATAR_SIZE) / 4);
  const leftAvatarCenterX = edgeGap + AVATAR_SIZE / 2;
  const rightAvatarCenterX = screenWidth - edgeGap - AVATAR_SIZE / 2;
  const leftBlockX = leftAvatarCenterX - AVATAR_BLOCK_MIN_WIDTH / 2;
  const rightBlockX = rightAvatarCenterX - AVATAR_BLOCK_MIN_WIDTH / 2;

  // Główne przyciski (Znajomi / Match!'ed / picker gatunku): wypozycjonowane tak,
  // by środek ekranu wypadał dokładnie między pigułkami Znajomi i Match!'ed.
  // Przesunięte niżej o połowę wysokości przycisku gatunku (GENRE_BUTTON_HEIGHT/2).
  const mainButtonsTop = screenHeight / 2 - OFFSET_TO_STACK_BOUNDARY + GENRE_BUTTON_HEIGHT / 2;
  const mainButtonsBottom = mainButtonsTop + TOTAL_STACK_HEIGHT;

  const ownBlock = (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.avatarBlock, { width: AVATAR_BLOCK_MIN_WIDTH }]}
      onPress={() => router.push('/profile')}
    >
      <Animated.View style={{ width: AVATAR_SIZE, transform: [{ translateY: ownFloatY }] }}>
        <Avatar url={profile?.avatar_url} size={AVATAR_SIZE} fallbackLetter={profile?.username} />
        <Text style={[styles.avatarNickname, nicknamePositionStyle]} numberOfLines={1}>
          {profile?.username ?? ''}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );

  const friendBlock = (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.avatarBlock, { width: AVATAR_BLOCK_MIN_WIDTH }]}
      onPress={() =>
        activePartner
          ? router.push({
              pathname: '/friend-profile/[connectionId]',
              params: {
                connectionId: activePartner.connectionId,
                partnerId: activePartner.partnerId,
                username: activePartner.username,
                avatarUrl: activePartner.avatarUrl ?? '',
              },
            })
          : router.push('/friends')
      }
    >
      <Animated.View style={{ width: AVATAR_SIZE, transform: [{ translateY: friendFloatY }] }}>
        <Avatar url={activePartner?.avatarUrl} size={AVATAR_SIZE} fallbackLetter={activePartner?.username} />
        <Text style={[styles.avatarNickname, nicknamePositionStyle]} numberOfLines={1}>
          {activePartner?.username ?? ''}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/moviematchbackground5.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      {/* Niewidoczny pomiar wszystkich nazw gatunków — ustala stałą szerokość przycisku */}
      {maxNameWidth === 0 && (
        <View style={styles.measureLayer} pointerEvents="none">
          {GENRES.map((g) => (
            <Text
              key={g.id}
              style={styles.categoryNameText}
              onLayout={(e) => onMeasureName(g.id, e.nativeEvent.layout.width)}
            >
              {g.name}
            </Text>
          ))}
        </View>
      )}

      {nicknameMaxWidth === 0 && (
        <Text
          style={[styles.avatarNickname, styles.measureLayer]}
          onLayout={(e) => setNicknameMaxWidth(e.nativeEvent.layout.width)}
        >
          {'M'.repeat(USERNAME_MAX_LENGTH)}
        </Text>
      )}

      <View style={[styles.headerRow, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.appTitle}>MovieMatch</Text>
        <View style={styles.headerButtonsRow}>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color="#ECEEF2" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            onPress={() => router.push('/account')}
          >
            <Ionicons name="settings-outline" size={22} color="#ECEEF2" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.avatarBlockAbsolute, { top: avatarRowTop, left: leftBlockX }]}>{ownOnLeft ? ownBlock : friendBlock}</View>
      <View style={[styles.avatarBlockAbsolute, { top: avatarRowTop, left: rightBlockX }]}>{ownOnLeft ? friendBlock : ownBlock}</View>

      {/* Znajomi + Match!'ed + przycisk gatunku: jedna spójna, wizualnie identyczna
          rodzina pigułek, ułożona w stos, wypozycjonowana tak, by środkowy przycisk
          (Match!'ed) wypadał dokładnie na środku ekranu. */}
      <View style={[styles.categoryStack, { top: mainButtonsTop }]}>
        <Animated.View style={{ transform: [{ scale: znajomiPress.scale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.stackPill, smallPillWidth ? { width: smallPillWidth } : null]}
            onPress={() => router.push('/friends')}
            onPressIn={znajomiPress.onPressIn}
            onPressOut={znajomiPress.onPressOut}
          >
            <Text style={styles.stackPillText}>Znajomi</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: matchPress.scale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.stackPill,
              smallPillWidth ? { width: smallPillWidth } : null,
              hasUnseenMatch && styles.stackPillHighlighted,
            ]}
            onPress={goToMatched}
            onPressIn={matchPress.onPressIn}
            onPressOut={matchPress.onPressOut}
            disabled={matchNavPending}
          >
            {matchNavPending ? (
              <ActivityIndicator color="#ECEEF2" size="small" />
            ) : (
              <Text style={styles.stackPillText}>Match!'ed</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.categoryPicker}>
          <Animated.View style={[styles.arrowButtonWrap, { transform: [{ scale: prevArrowPress.scale }] }]}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.arrowButton}
              onPress={goPrev}
              onPressIn={prevArrowPress.onPressIn}
              onPressOut={prevArrowPress.onPressOut}
              hitSlop={12}
            >
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={{ transform: [{ translateX: genreShakeTranslateX }] }}>
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.categoryNameButton, categoryButtonWidth ? { width: categoryButtonWidth } : null]}
              onPress={() => setGridVisible(true)}
              {...panResponder.panHandlers}
            >
              <Text style={styles.categoryNameText} numberOfLines={1}>
                {currentGenre.name}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.arrowButtonWrap, { transform: [{ scale: nextArrowPress.scale }] }]}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.arrowButton}
              onPress={goNext}
              onPressIn={nextArrowPress.onPressIn}
              onPressOut={nextArrowPress.onPressOut}
              hitSlop={12}
            >
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      <View style={[styles.belowStackArea, { top: mainButtonsBottom + HINT_GAP }]}>
        <Text style={styles.categoryHint}>Dotknij, by wybrać z listy</Text>

        <View style={[styles.swipeButtonArea, { marginTop: HINT_GAP }]}>
          <Animated.View style={[styles.swipeButton, { transform: [{ scale: swipeBtnPress.scale }] }]}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.swipeButtonInner}
              onPress={goToSwipe}
              onPressIn={swipeBtnPress.onPressIn}
              onPressOut={swipeBtnPress.onPressOut}
            >
              {/* Placeholder grafiki — docelowo do podmiany na dedykowaną ikonę */}
              <Ionicons name="videocam-outline" size={44} color="#FF6A4D" style={styles.swipeIconGlow} />
            </TouchableOpacity>
          </Animated.View>
          <Text style={[styles.categoryHint, styles.belowSwipeHint]}>Dotknij, by zacząć wybierać filmy</Text>
        </View>
      </View>

      <Modal visible={gridVisible} transparent animationType="fade" onRequestClose={() => setGridVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.gridOverlay} onPress={() => setGridVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.gridCard} onPress={() => {}}>
            <Text style={styles.gridTitle}>Wybierz kategorię</Text>
            {rows.map((row, idx) => (
              <View key={idx} style={styles.gridRow}>
                {row.map((genre) => (
                  <TouchableOpacity activeOpacity={1} key={genre.id} style={styles.gridTile} onPress={() => selectGenre(genre)}>
                    <Text style={styles.gridTileText}>{genre.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.55)' },

  measureLayer: { position: 'absolute', top: -1000, left: 0, opacity: 0 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  appTitle: { fontSize: 22, fontWeight: 'bold', color: '#ECEEF2' },

  headerButtonsRow: { flexDirection: 'row', gap: 10 },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: { backgroundColor: '#0B0F17' },

  avatarBlockAbsolute: { position: 'absolute' },
  avatarBlock: { alignItems: 'center' },
  avatarNickname: {
    color: '#ECEEF2',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  categoryStack: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  stackPill: {
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18 * SMALL_PILL_SCALE,
    paddingVertical: CATEGORY_PADDING_V * SMALL_PILL_SCALE,
    paddingHorizontal: CATEGORY_PADDING_H * SMALL_PILL_SCALE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: STACK_GAP,
  },
  stackPillHighlighted: { backgroundColor: '#E8A33D', borderColor: '#E8A33D' },
  stackPillText: { color: '#ECEEF2', fontSize: CATEGORY_FONT_SIZE * SMALL_PILL_SCALE, fontWeight: 'bold' },

  categoryPicker: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  arrowButtonWrap: { flex: 1 },
  arrowButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { color: '#ECEEF2', fontSize: 31, fontWeight: 'bold' },
  categoryNameButton: {
    marginHorizontal: 10,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 18,
    paddingVertical: CATEGORY_PADDING_V,
    paddingHorizontal: CATEGORY_PADDING_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryNameText: { color: '#ECEEF2', fontSize: CATEGORY_FONT_SIZE, fontWeight: 'bold' },

  // Bez bottom:0 — wysokość dopasowuje się do treści (napis + przycisk +
  // drugi napis), pozycjonowana wyłącznie przez "top" (patrz JSX), symetrycznie
  // względem przycisku gatunku powyżej i przycisku swipe'a poniżej.
  belowStackArea: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  categoryHint: { color: '#5E6673', fontSize: 12, marginBottom: HINT_GAP }, // #7C8798 przyciemnione o 20%
  belowSwipeHint: { marginBottom: 0, marginTop: HINT_GAP },

  swipeButtonArea: { width: '100%', alignItems: 'center' },
  swipeButton: {
    width: '37%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeIconGlow: {
    textShadowColor: '#FF6A4D',
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
  },

  gridOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  gridCard: {
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 20,
  },
  gridTitle: { color: '#ECEEF2', fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  gridRow: { flexDirection: 'row', marginBottom: 10 },
  gridTile: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 20,
    backgroundColor: '#0B0F17',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTileText: { color: '#ECEEF2', fontSize: 15, fontWeight: 'bold' },
});
