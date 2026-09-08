import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { MovieDetailModal } from '../components/swipe/MovieDetailModal';
import { useFriendRatingRealtime } from '../hooks/useFriendRatingRealtime';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectionsStore } from '../store/useConnectionsStore';
import { MatchRow, useMatchesStore } from '../store/useMatchesStore';

// Ocena użytkownika (1-10) podświetlona kolorem w spektrum czerwony -> zielony
// (1 = czerwony, 10 = zielony), przechodząc przez pomarańcz/żółty po drodze.
function scoreToColor(score: number): string {
  const t = (score - 1) / 9;
  const hue = t * 120; // 0 = czerwony, 120 = zielony
  return `hsl(${hue}, 62%, 45%)`;
}

// Każdy z 10 przycisków oceny jest podzielony po przekątnej (45°): dolna-prawa
// połówka koloruje się WYŁĄCZNIE tą liczbą, którą kliknąłem ja, górna-lewa —
// tą, którą kliknął znajomy (lustrzanie u niego). Niekliknięta przez daną osobę
// połówka zostaje przezroczysta (widać przez nią tło przycisku), nie szara.
// Zrobione bez SVG: kwadrat większy od docelowego rozmiaru, podzielony poziomo
// na pół, obrócony o -45° i przycięty do koła przez overflow:'hidden'.
function ScoreDot({
  n,
  size,
  isMine,
  isFriend,
  opacity,
  marginRight,
  onPress,
}: {
  n: number;
  size: number;
  isMine: boolean;
  isFriend: boolean;
  opacity: number;
  marginRight: number;
  onPress: () => void;
}) {
  const squareSize = size * 1.6;
  const active = isMine || isFriend;
  return (
    <TouchableOpacity onPress={onPress} style={{ width: size, height: size, marginRight, opacity }}>
      <View style={[styles.scoreDot, { width: size, height: size, borderRadius: size / 2 }]}>
        <View
          style={{
            position: 'absolute',
            width: squareSize,
            height: squareSize,
            left: (size - squareSize) / 2,
            top: (size - squareSize) / 2,
            transform: [{ rotate: '-45deg' }],
          }}
        >
          {/* Górna połowa kwadratu po obrocie o -45° trafia w górny-lewy róg — ocena znajomego. */}
          <View style={{ flex: 1, backgroundColor: isFriend ? scoreToColor(n) : 'transparent' }} />
          {/* Dolna połowa trafia w dolny-prawy róg — moja ocena. */}
          <View style={{ flex: 1, backgroundColor: isMine ? scoreToColor(n) : 'transparent' }} />
        </View>
        <Text
          style={[styles.scoreDotText, { fontSize: size * 0.42 }, active && styles.scoreDotTextActive]}
          pointerEvents="none"
        >
          {n}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
// Odstęp między "przyciskami" ocen — same przyciski dobierają rozmiar tak, by
// dokładnie wypełnić dostępną szerokość (patrz onLayout na scoreRow niżej).
const SCORE_GAP = 4;

// Dwie niezależne osie filtrowania, wybieralne jednocześnie: kolejność
// (najnowsze/najstarsze) i stan obejrzenia (obejrzane/nieobejrzane, opcjonalnie
// żadne = wszystkie). Poprzednio było to jedno pole wyboru z czterema opcjami
// wzajemnie się wykluczającymi — teraz obie pary działają równolegle.
type OrderMode = 'newest' | 'oldest';
type WatchFilter = 'all' | 'watched' | 'unwatched';

const ORDER_OPTIONS: { key: OrderMode; label: string }[] = [
  { key: 'newest', label: 'Najnowsze' },
  { key: 'oldest', label: 'Najstarsze' },
];

const WATCH_OPTIONS: { key: Exclude<WatchFilter, 'all'>; label: string }[] = [
  { key: 'unwatched', label: 'Nieobejrzane' },
  { key: 'watched', label: 'Obejrzane' },
];

export default function MatchedScreen() {
  const router = useRouter();
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const partners = useConnectionsStore((s) => s.partners);
  const myId = useAuthStore((s) => s.session?.user.id) ?? null;
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);

  // Dane dopasowań/ocen żyją teraz we wspólnym store (useMatchesStore) zamiast
  // lokalnego stanu — dzięki temu przycisk "Match!'ed" (na ekranie głównym i w
  // swipe'owaniu) może je pobrać z WYPRZEDZENIEM, zanim jeszcze wejdziemy na
  // ten ekran, więc kafelki nie muszą się już dogrywać PO wejściu.
  const storeConnectionId = useMatchesStore((s) => s.connectionId);
  const matches = useMatchesStore((s) => s.matches);
  const ratings = useMatchesStore((s) => s.ratings);
  const friendScores = useMatchesStore((s) => s.friendScores);
  const storeReady = useMatchesStore((s) => s.ready);
  const prefetchMatches = useMatchesStore((s) => s.prefetch);
  const storeSetRating = useMatchesStore((s) => s.setRating);
  const storeSetFriendScore = useMatchesStore((s) => s.setFriendScore);
  const storeRemoveMatch = useMatchesStore((s) => s.removeMatch);
  // Gotowe tylko wtedy, gdy store trzyma dane DOKŁADNIE dla aktywnego znajomego
  // (a nie np. resztki po poprzednim) — inaczej, jeśli ktoś wejdzie na ten
  // ekran z pominięciem przycisku "Match!'ed" (np. z powiadomienia), sami
  // dociągamy dane poniżej.
  const contentLoading = !activeConnectionId || storeConnectionId !== activeConnectionId || !storeReady;
  useEffect(() => {
    if (activeConnectionId && myId && contentLoading) {
      prefetchMatches(activeConnectionId, myId);
    }
  }, [activeConnectionId, myId, contentLoading, prefetchMatches]);

  const [orderMode, setOrderMode] = useState<OrderMode>('newest');
  // Domyślnie aktywny filtr "Nieobejrzane" — ekran ma zawsze startować z
  // najnowszymi i nieobejrzanymi filmami widocznymi jako pierwsze.
  const [watchFilter, setWatchFilter] = useState<WatchFilter>('unwatched');
  const [deleteMatchTarget, setDeleteMatchTarget] = useState<MatchRow | null>(null);
  const [deletingMatch, setDeletingMatch] = useState(false);
  // Zmierzona szerokość rzędu z ocenami — przyciski ocen skalują się tak, by
  // wszystkie 10 opcji dokładnie wypełniło miejsce na prawo od checkboxa.
  const [scoreRowWidth, setScoreRowWidth] = useState(0);
  const scoreDotSize =
    scoreRowWidth > 0 ? (scoreRowWidth - SCORE_GAP * (SCORE_OPTIONS.length - 1)) / SCORE_OPTIONS.length : 24;
  // Płynne pojawienie się listy dopiero, gdy WSZYSTKO (dopasowania + oceny +
  // szerokość rzędu z ocenami) jest już gotowe — bez tego kafelki potrafiły
  // "mrugnąć": najpierw wejść z domyślnym (za małym) rozmiarem kropek ocen,
  // po czym doskoczyć do docelowego rozmiaru w kolejnej klatce.
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const contentReady = !contentLoading && scoreRowWidth > 0;
  useEffect(() => {
    if (contentReady) {
      Animated.timing(contentFadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    } else {
      contentFadeAnim.setValue(0);
    }
  }, [contentReady, contentFadeAnim]);
  // Popup "zgodność ocen" (analogiczny do "Match!'ed" przy swipe'owaniu) — pokazuje
  // się raz na dopasowanie, gdy moja i znajomego ocena filmu okażą się takie same.
  const [scoreMatchPopup, setScoreMatchPopup] = useState<{
    title: string;
    year: string | null;
    image: string | null;
    score: number;
  } | null>(null);
  // Dopasowania, dla których popup już się pokazał — bez tego wyskakiwałby
  // ponownie przy każdym ponownym wejściu na ekran, dopóki obie oceny się zgadzają.
  const congratulatedRef = useRef<Set<string>>(new Set());

  const activePartner = partners.find((p) => p.connectionId === activeConnectionId);
  const friendId = activePartner?.partnerId ?? null;

  // Jeśli po zmianie (mojej lub znajomego) obie oceny dla danego filmu się zgadzają
  // i jeszcze nie było o tym popupu — pokaż go. Jeśli oceny przestały się zgadzać
  // (ktoś zmienił swoją), zapamiętaj to, żeby przyszła ponowna zgodność mogła znowu
  // wywołać powiadomienie.
  const updateScoreMatchState = (matchId: string, myScore: number | null, friendScore: number | null) => {
    if (myScore != null && friendScore != null && myScore === friendScore) {
      if (!congratulatedRef.current.has(matchId)) {
        congratulatedRef.current.add(matchId);
        const movie = matches.find((m) => m.id === matchId);
        if (movie) setScoreMatchPopup({ title: movie.title, year: movie.year, image: movie.image, score: myScore });
      }
    } else {
      congratulatedRef.current.delete(matchId);
    }
  };

  // Nasłuch na żywo ocen znajomego — bez tego znaczek/kropki i powiadomienie
  // o zgodności aktualizowałyby się dopiero po ponownym wejściu na ekran.
  useFriendRatingRealtime(friendId, (payload) => {
    if (!matches.some((m) => m.id === payload.match_id)) return;
    storeSetFriendScore(payload.match_id, payload.user_score);
    updateScoreMatchState(payload.match_id, ratings[payload.match_id]?.userScore ?? null, payload.user_score);
  });

  // Lista przychodzi z zapytania już posortowana malejąco po matched_at (najnowsze
  // pierwsze). Kolejność i filtr obejrzenia działają teraz niezależnie i jednocześnie
  // — najpierw ewentualne odwrócenie kolejności, potem filtr obejrzenia.
  const visibleMatches = useMemo(() => {
    const ordered = orderMode === 'oldest' ? [...matches].reverse() : matches;
    if (watchFilter === 'watched') return ordered.filter((m) => ratings[m.id]?.watched);
    if (watchFilter === 'unwatched') return ordered.filter((m) => !ratings[m.id]?.watched);
    return ordered;
  }, [matches, ratings, orderMode, watchFilter]);

  const deleteMatch = async () => {
    if (!deleteMatchTarget) return;
    setDeletingMatch(true);
    try {
      await storeRemoveMatch(deleteMatchTarget.id);
      setDeleteMatchTarget(null);
    } catch (e) {
      // Błąd już zalogowany w store — tu tylko nie zamykamy modala, żeby
      // można było spróbować ponownie.
    } finally {
      setDeletingMatch(false);
    }
  };

  const toggleWatched = (matchId: string) => {
    if (!myId) return;
    const current = ratings[matchId];
    storeSetRating(matchId, myId, { watched: !current?.watched, userScore: current?.userScore ?? null });
  };

  const setScore = (matchId: string, score: number) => {
    if (!myId) return;
    const current = ratings[matchId];
    const nextScore = current?.userScore === score ? null : score;
    storeSetRating(matchId, myId, { watched: current?.watched ?? false, userScore: nextScore });
    updateScoreMatchState(matchId, nextScore, friendScores[matchId] ?? null);
  };

  const goToFriendProfile = () => {
    if (!activePartner) return;
    router.push({
      pathname: '/friend-profile/[connectionId]',
      params: {
        connectionId: activePartner.connectionId,
        partnerId: activePartner.partnerId,
        username: activePartner.username,
        avatarUrl: activePartner.avatarUrl ?? '',
      },
    });
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/background/universal_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      {/* Niewidoczna "sonda" o identycznej strukturze co pasek ocen w kafelku —
          mierzy dostępną szerokość NIEZALEŻNIE od tego, czy jakikolwiek kafelek
          jest akurat "obejrzany" (czyli faktycznie pokazuje pasek ocen). Bez
          tego pierwszy widoczny pasek ocen doskakiwał do właściwego rozmiaru
          dopiero w kolejnej klatce po wejściu na ekran — stąd wrażenie "mrugania". */}
      {scoreRowWidth === 0 && (
        <View style={styles.scoreMeasureProbe} pointerEvents="none">
          <View style={styles.row}>
            <View style={styles.ratingRow}>
              <View style={styles.watchedToggle}>
                <View style={styles.checkbox} />
              </View>
              <View style={styles.scoreRow} onLayout={(e) => setScoreRowWidth(e.nativeEvent.layout.width)} />
            </View>
          </View>
        </View>
      )}

      {/* Własny, subtelny nagłówek (jak na profilu znajomego) zamiast natywnego
          czarnego paska nawigacji. */}
      <View style={styles.customHeaderRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Wspólnie polubione ({matches.length})
        </Text>
        <View style={styles.headerActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={18} color="#ECEEF2" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            onPress={() => router.push('/account')}
          >
            <Ionicons name="settings-outline" size={18} color="#ECEEF2" />
          </Pressable>
        </View>
      </View>

      {activeConnectionId && (
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBarPartnerBlock}
            activeOpacity={0.7}
            hitSlop={6}
            disabled={!activePartner}
            onPress={goToFriendProfile}
          >
            <Avatar url={activePartner?.avatarUrl} size={64} fallbackLetter={activePartner?.username} />
            {activePartner?.username ? (
              <Text style={styles.topBarPartner} numberOfLines={1}>{activePartner.username}</Text>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changeFriendButton} onPress={() => router.push('/friends')}>
            <Text style={styles.changeFriendButtonText}>Zmień</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Linia oddzielająca wizualnie avatar/nick/"Zmień" od filtrów poniżej —
          w tym samym jasnym odcieniu co obramowania przycisków w aplikacji. */}
      {activeConnectionId && <View style={styles.headerDivider} />}

      {/* Pasek filtrów zawsze obecny (dopóki jest aktywny znajomy) i w stałym
          miejscu, bezpośrednio pod avatarem — wybór filtra nigdy nie zmienia
          rozmieszczenia elementów nad listą; ta sekcja jest "na sztywno". */}
      {activeConnectionId && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortBar}
          contentContainerStyle={styles.sortBarContent}
        >
          {/* Para "kolejność" — przyciski w parze bliżej siebie (mniejszy gap). */}
          <View style={styles.chipPair}>
            {ORDER_OPTIONS.map((opt) => {
              const active = orderMode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setOrderMode(opt.key)}
                >
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pionowa kreska między parami — ten sam styl co linia pod avatarem. */}
          <View style={styles.sortDivider} />

          {/* Para "obejrzane/nieobejrzane" — obie wybieralne niezależnie od kolejności;
              tapnięcie aktywnego filtra wyłącza go z powrotem (pokazuje wszystkie). */}
          <View style={styles.chipPair}>
            {WATCH_OPTIONS.map((opt) => {
              const active = watchFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setWatchFilter((prev) => (prev === opt.key ? 'all' : opt.key))}
                >
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {!activeConnectionId ? (
        <View style={styles.centerContent}>
          <Text style={styles.text}>
            Wybierz aktywnego znajomego w sekcji „Znajomi", żeby zobaczyć wspólnie polubione filmy.
          </Text>
        </View>
      ) : !contentReady ? (
        // Ekran (łącznie z kafelkami) nie pojawia się, dopóki dopasowania,
        // oceny I szerokość paska ocen nie są w 100% gotowe — wolniej, ale bez
        // "mrugnięcia" kafelków tuż po wejściu.
        <View style={styles.centerContent}>
          <ActivityIndicator color="#ECEEF2" />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.text}>Wspólnie polubione filmy pojawią się tutaj, gdy oboje przesuniecie ten sam tytuł w prawo.</Text>
        </View>
      ) : visibleMatches.length === 0 ? (
        // Wyrównane od góry (tuż pod paskiem filtrów), nie na środku ekranu —
        // spójnie z tym, że same filmy też mają się pojawiać od góry.
        <View style={styles.topMessage}>
          <Text style={styles.text}>Brak filmów pasujących do wybranego filtra.</Text>
        </View>
      ) : (
        <Animated.FlatList
          style={[styles.matchList, { opacity: contentFadeAnim }]}
          data={visibleMatches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const rating = ratings[item.id];
            return (
              <View style={[styles.row, rating?.watched && styles.rowWatched]}>
                {/* Czerwony krzyżyk w prawym górnym rogu kafelka — usuwa dopasowanie
                    (po potwierdzeniu w modalu poniżej). */}
                <TouchableOpacity
                  style={styles.removeMatchButton}
                  onPress={() => setDeleteMatchTarget(item)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#E12D2D" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.rowMain} onPress={() => setSelectedMatch(item)}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.poster} contentFit="cover" />
                  ) : (
                    <View style={[styles.poster, styles.posterPlaceholder]} />
                  )}
                  <Text style={[styles.rowText, styles.rowTextWithRemove]} numberOfLines={2} ellipsizeMode="tail">
                    {item.title}
                    {item.year ? ` (${item.year})` : ''}
                  </Text>
                </TouchableOpacity>

                <View style={styles.ratingRow}>
                  {/* Sam checkbox, bez podpisu "Obejrzane" — zwolnione miejsce
                      pozwala zmieścić wszystkie 10 ocen w jednym wierszu bez scrolla. */}
                  <TouchableOpacity style={styles.watchedToggle} onPress={() => toggleWatched(item.id)} hitSlop={7}>
                    <View style={[styles.checkbox, rating?.watched && styles.checkboxChecked]}>
                      {rating?.watched ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                  </TouchableOpacity>

                  {rating?.watched &&
                    (() => {
                      const myScore = rating?.userScore ?? null;
                      const friendScore = friendScores[item.id] ?? null;
                      // Ten jeden przycisk znajomego (jeśli jego ocena różni się od mojej)
                      // ma zostać w pełni widoczny mimo przygaszenia reszty — to właśnie
                      // on informuje mnie "znajomy już ocenił, ale inaczej niż ja".
                      const highlightExtra =
                        myScore != null && friendScore != null && friendScore !== myScore ? friendScore : null;
                      return (
                        <View
                          style={styles.scoreRow}
                          onLayout={(e) => {
                            const w = e.nativeEvent.layout.width;
                            setScoreRowWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
                          }}
                        >
                          {SCORE_OPTIONS.map((n, idx) => {
                            const isMine = myScore === n;
                            const isFriend = friendScore === n;
                            const dotOpacity = myScore == null ? 1 : isMine || n === highlightExtra ? 1 : 0.75;
                            return (
                              <ScoreDot
                                key={n}
                                n={n}
                                size={scoreDotSize}
                                isMine={isMine}
                                isFriend={isFriend}
                                opacity={dotOpacity}
                                marginRight={idx < SCORE_OPTIONS.length - 1 ? SCORE_GAP : 0}
                                onPress={() => setScore(item.id, n)}
                              />
                            );
                          })}
                        </View>
                      );
                    })()}
                </View>
              </View>
            );
          }}
        />
      )}

      <MovieDetailModal
        visible={!!selectedMatch}
        movieId={selectedMatch?.movie_id ?? null}
        fallbackTitle={selectedMatch?.title}
        fallbackYear={selectedMatch?.year}
        fallbackImage={selectedMatch?.image}
        onClose={() => setSelectedMatch(null)}
      />

      <Modal visible={!!scoreMatchPopup} transparent animationType="fade" onRequestClose={() => setScoreMatchPopup(null)}>
        <TouchableOpacity style={styles.scoreMatchOverlay} activeOpacity={1} onPress={() => setScoreMatchPopup(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.scoreMatchCard} onPress={() => {}}>
            <Text style={styles.scoreMatchHeading}>Zgodność ocen! 🎉</Text>
            {scoreMatchPopup?.image ? (
              <Image source={{ uri: scoreMatchPopup.image }} style={styles.scoreMatchPoster} contentFit="cover" />
            ) : null}
            <Text style={styles.scoreMatchTitle} numberOfLines={2}>
              {scoreMatchPopup?.title}
              {scoreMatchPopup?.year ? ` (${scoreMatchPopup.year})` : ''}
            </Text>
            <Text style={styles.scoreMatchSubtitle}>
              Oboje oceniliście na {scoreMatchPopup?.score}/10!
            </Text>
            <TouchableOpacity style={styles.scoreMatchButton} onPress={() => setScoreMatchPopup(null)}>
              <Text style={styles.scoreMatchButtonText}>Super!</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!deleteMatchTarget} transparent animationType="fade" onRequestClose={() => setDeleteMatchTarget(null)}>
        <TouchableOpacity style={styles.scoreMatchOverlay} activeOpacity={1} onPress={() => setDeleteMatchTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.deleteMatchCard} onPress={() => {}}>
            <Text style={styles.scoreMatchHeading}>Usuń dopasowanie</Text>
            <Text style={styles.deleteMatchMessage} numberOfLines={2}>
              Na pewno usunąć „{deleteMatchTarget?.title}” z listy wspólnie polubionych?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setDeleteMatchTarget(null)}
                disabled={deletingMatch}
              >
                <Text style={styles.modalCancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={deleteMatch} disabled={deletingMatch}>
                {deletingMatch ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Usuń</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Wyrównane od góry (nie na środku ekranu) — dla stanu "brak wyników filtra".
  topMessage: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  text: { color: '#ECEEF2', fontSize: 16, textAlign: 'center', lineHeight: 24 },

  // flex:1, żeby lista zajmowała dokładnie pozostałą przestrzeń pod stałym
  // paskiem filtrów i renderowała elementy od góry, nigdy nie centrując ich
  // w pionie, niezależnie od tego, ile filmów przejdzie przez filtr.
  matchList: { flex: 1 },

  // Niewidoczna sonda pomiarowa (patrz komentarz przy jej użyciu w JSX) —
  // ten sam padding co listContent, żeby zmierzona szerokość dokładnie
  // odpowiadała szerokości prawdziwego kafelka.
  scoreMeasureProbe: { position: 'absolute', top: -1000, left: 0, right: 0, opacity: 0, paddingHorizontal: 20 },

  customHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#ECEEF2', fontSize: 26 },
  headerTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  headerActionsRow: { flexDirection: 'row', gap: 8 },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButtonPressed: { backgroundColor: '#0B0F17' },

  topBar: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Górny odstęp = boczny (20), zamiast dawnej martwej przestrzeni pod
    // nagłówkiem nawigacji "Wspólnie polubione".
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  // Cienka pozioma linia oddzielająca avatar/nick/"Zmień" od filtrów — w tym
  // samym jasnym odcieniu co obramowania przycisków w reszcie aplikacji.
  headerDivider: {
    flexGrow: 0,
    flexShrink: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#7C8798',
    marginHorizontal: 20,
    opacity: 0.5,
  },
  topBarPartnerBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  topBarPartner: { color: '#ECEEF2', fontSize: 17, fontWeight: 'bold', marginLeft: 10, flexShrink: 1 },
  changeFriendButton: {
    backgroundColor: '#141A24',
    borderWidth: 1,
    borderColor: '#7C8798',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  changeFriendButtonText: { color: '#ECEEF2', fontSize: 12, fontWeight: 'bold' },

  // Jawna wysokość paska + pigułek (zamiast liczenia jej z paddingu) — daje
  // gwarantowaną, przewidywalną przestrzeń w pionie na literę bez przycinania,
  // niezależnie od metryk czcionki na danym urządzeniu. flexGrow/Shrink:0, żeby
  // ten pasek nigdy nie mógł zostać "rozciągnięty" i zepchnąć listę w dół.
  sortBar: { flexGrow: 0, flexShrink: 0, height: 52, marginTop: 10 },
  sortBarContent: { paddingHorizontal: 20, gap: 14, alignItems: 'center' },
  // Przyciski wewnątrz jednej pary (kolejność / obejrzenie) bliżej siebie niż
  // odstęp między samymi parami.
  chipPair: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  sortDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: '#7C8798', opacity: 0.5 },
  sortChip: {
    height: 44,
    backgroundColor: '#141A24',
    borderWidth: 1,
    borderColor: '#3A382F',
    borderRadius: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortChipActive: { backgroundColor: '#E8A33D', borderColor: '#E8A33D' },
  sortChipText: { color: '#7C8798', fontSize: 13, fontWeight: 'bold', lineHeight: 18, includeFontPadding: false },
  sortChipTextActive: { color: '#0B0F17' },

  listContent: { padding: 20, paddingTop: 10 },
  // Kafelek, plakat i checkbox powiększone o 20% względem oryginalnej wersji.
  row: {
    backgroundColor: '#141A24',
    borderRadius: 17,
    borderWidth: 0.25,
    borderColor: '#7C8798',
    padding: 12,
    marginBottom: 9.6,
    position: 'relative',
  },
  rowWatched: { borderColor: '#4a7', borderWidth: 0.75 },
  rowMain: { flexDirection: 'row', alignItems: 'center' },
  poster: { width: 48, height: 70, borderRadius: 7, marginRight: 14 },
  posterPlaceholder: { backgroundColor: '#333' },
  // Tytuł o 50% większy niż poprzednio (15 -> 22.5) i bez limitu numberOfLines —
  // zawija się na tyle wierszy, ile potrzeba, żeby zmieścić się w kafelku.
  rowText: { color: '#ECEEF2', fontSize: 22.5, flex: 1, flexWrap: 'wrap' },
  rowTextWithRemove: { marginRight: 22 },
  // Sam czerwony krzyżyk, bez kółka/tła pod spodem.
  removeMatchButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3A382F',
  },
  watchedToggle: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  // +20% względem oryginalnych 18x18 / promień 4.
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#7C8798',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4a7', borderColor: '#4a7' },
  checkboxMark: { color: '#12211A', fontSize: 14, fontWeight: 'bold' },

  // Zwykły wiersz (bez scrolla) — bez podpisu "Obejrzane" wszystkie 10 ocen
  // mieści się w jednej linii, a same przyciski (rozmiar ustawiany w JSX na
  // podstawie zmierzonej szerokości) dokładnie wypełniają dostępne miejsce.
  scoreRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  scoreDot: {
    borderWidth: 1,
    borderColor: '#3A382F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scoreDotText: { color: '#7C8798', fontWeight: 'bold' },
  // Jaśniejszy tekst + delikatny cień zamiast ciemnego tekstu na kolorowym tle —
  // połówki kropki bywają częściowo kolorowe, częściowo przezroczyste (ciemne
  // tło rzędu), więc jeden stały ciemny kolor tekstu byłby nieczytelny na tej
  // drugiej połowie.
  scoreDotTextActive: {
    color: '#F5F1E6',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Popup zgodności ocen — ten sam "chrom" co MatchPopup przy swipe'owaniu
  // (akcent #E8A33D), żeby wizualnie należał do tej samej rodziny powiadomień.
  scoreMatchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  scoreMatchCard: {
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#E8A33D',
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  scoreMatchHeading: { color: '#E8A33D', fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  scoreMatchPoster: { width: 140, height: 210, borderRadius: 12, marginBottom: 14 },
  scoreMatchTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  scoreMatchSubtitle: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginBottom: 18 },
  scoreMatchButton: { backgroundColor: '#E8A33D', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 30 },
  scoreMatchButtonText: { color: '#0B0F17', fontWeight: 'bold', fontSize: 15 },

  deleteMatchCard: {
    backgroundColor: '#141A24',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  deleteMatchMessage: { color: '#7C8798', fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#555',
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    marginRight: 8,
  },
  modalCancelButtonText: { color: '#fff', fontWeight: 'bold' },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#E12D2D',
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    marginLeft: 8,
  },
  modalConfirmButtonText: { color: '#fff', fontWeight: 'bold' },
});
