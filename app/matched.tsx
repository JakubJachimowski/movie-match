import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { MovieDetailModal } from '../components/swipe/MovieDetailModal';
import { useFriendRatingRealtime } from '../hooks/useFriendRatingRealtime';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectionsStore } from '../store/useConnectionsStore';

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

interface MatchRow {
  id: string;
  movie_id: string;
  title: string;
  year: string | null;
  image: string | null;
  matched_at: string;
}

interface MatchRating {
  watched: boolean;
  userScore: number | null;
}

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
// Odstęp między "przyciskami" ocen — same przyciski dobierają rozmiar tak, by
// dokładnie wypełnić dostępną szerokość (patrz onLayout na scoreRow niżej).
const SCORE_GAP = 4;

type SortMode = 'newest' | 'oldest' | 'watched' | 'unwatched';

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'newest', label: 'Najnowsze' },
  { key: 'oldest', label: 'Najstarsze' },
  { key: 'watched', label: 'Obejrzane' },
  { key: 'unwatched', label: 'Nieobejrzane' },
];

export default function MatchedScreen() {
  const router = useRouter();
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId);
  const partners = useConnectionsStore((s) => s.partners);
  const myId = useAuthStore((s) => s.session?.user.id) ?? null;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);
  const [ratings, setRatings] = useState<Record<string, MatchRating>>({});
  // Oceny znajomego dla tych samych dopasowań — tylko user_score (do znaczka
  // podzielonego po przekątnej); "watched" znajomego nie jest nam nigdzie potrzebne.
  const [friendScores, setFriendScores] = useState<Record<string, number | null>>({});
  // Osobny stan wczytywania dla ocen/checkboxów "obejrzane" — ekran nie ma
  // pokazywać listy dopóki NIE ma jeszcze tych danych, żeby uniknąć widocznego
  // "mignięcia" (najpierw puste checkboxy, chwilę później doskakujące stany).
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const contentLoading = loading || ratingsLoading;
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  // Zmierzona szerokość rzędu z ocenami — przyciski ocen skalują się tak, by
  // wszystkie 10 opcji dokładnie wypełniło miejsce na prawo od checkboxa.
  const [scoreRowWidth, setScoreRowWidth] = useState(0);
  const scoreDotSize =
    scoreRowWidth > 0 ? (scoreRowWidth - SCORE_GAP * (SCORE_OPTIONS.length - 1)) / SCORE_OPTIONS.length : 24;
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
    setFriendScores((prev) => ({ ...prev, [payload.match_id]: payload.user_score }));
    updateScoreMatchState(payload.match_id, ratings[payload.match_id]?.userScore ?? null, payload.user_score);
  });

  // Lista przychodzi z zapytania już posortowana malejąco po matched_at (najnowsze
  // pierwsze). "Tylko obejrzane"/"tylko nieobejrzane" filtrują, zachowując kolejność
  // najnowsze-na-górze; "najstarsze" odwraca kolejność.
  const visibleMatches = useMemo(() => {
    switch (sortMode) {
      case 'oldest':
        return [...matches].reverse();
      case 'watched':
        return matches.filter((m) => ratings[m.id]?.watched);
      case 'unwatched':
        return matches.filter((m) => !ratings[m.id]?.watched);
      case 'newest':
      default:
        return matches;
    }
  }, [matches, ratings, sortMode]);

  useEffect(() => {
    if (!activeConnectionId) {
      setMatches([]);
      setLoading(false);
      setRatingsLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Blokujemy wyświetlenie listy dopóki nie doczytają się też oceny — inaczej
    // ekran zdążyłby pokazać checkboxy w stanie "nieobejrzane" na moment przed
    // doskoczeniem prawdziwych wartości.
    setRatingsLoading(true);
    supabase
      .from('matches')
      .select('id, movie_id, title, year, image, matched_at')
      .eq('connection_id', activeConnectionId)
      .order('matched_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('fetch matches error', error);
          setMatches([]);
        } else {
          setMatches(data ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId]);

  // Wczytuje własne oceny ("obejrzane" + userscore) dla aktualnie widocznych
  // dopasowań — przechowywane lokalnie w Supabase (tabela match_ratings),
  // osobno per użytkownik, nigdy nie wysyłane do TMDB.
  useEffect(() => {
    if (!myId || matches.length === 0) {
      setRatings({});
      setFriendScores({});
      setRatingsLoading(false);
      return;
    }
    let cancelled = false;
    setRatingsLoading(true);
    // Bez filtra po user_id — polityka RLS (match_ratings_select_shared) i tak
    // zwraca tylko wiersze dla wspólnych dopasowań, więc jednym zapytaniem
    // dostajemy zarówno własne oceny, jak i oceny znajomego.
    supabase
      .from('match_ratings')
      .select('match_id, user_id, watched, user_score')
      .in(
        'match_id',
        matches.map((m) => m.id)
      )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('fetch match_ratings error', error);
          setRatingsLoading(false);
          return;
        }
        const mine: Record<string, MatchRating> = {};
        const theirs: Record<string, number | null> = {};
        (data ?? []).forEach((r) => {
          if (r.user_id === myId) {
            mine[r.match_id] = { watched: r.watched, userScore: r.user_score };
          } else {
            theirs[r.match_id] = r.user_score;
          }
        });
        setRatings(mine);
        setFriendScores(theirs);
        setRatingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matches, myId]);

  const saveRating = async (matchId: string, next: MatchRating) => {
    if (!myId) return;
    setRatings((prev) => ({ ...prev, [matchId]: next }));
    const { error } = await supabase
      .from('match_ratings')
      .upsert(
        { match_id: matchId, user_id: myId, watched: next.watched, user_score: next.userScore },
        { onConflict: 'match_id,user_id' }
      );
    if (error) console.warn('upsert match_ratings error', error);
  };

  const toggleWatched = (matchId: string) => {
    const current = ratings[matchId];
    saveRating(matchId, { watched: !current?.watched, userScore: current?.userScore ?? null });
  };

  const setScore = (matchId: string, score: number) => {
    const current = ratings[matchId];
    const nextScore = current?.userScore === score ? null : score;
    saveRating(matchId, { watched: current?.watched ?? false, userScore: nextScore });
    updateScoreMatchState(matchId, nextScore, friendScores[matchId] ?? null);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Wspólnie polubione (${matches.length})` }} />
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      {activeConnectionId && (
        <View style={styles.topBar}>
          <View style={styles.topBarPartnerBlock}>
            <Avatar url={activePartner?.avatarUrl} size={64} fallbackLetter={activePartner?.username} />
            {activePartner?.username ? (
              <Text style={styles.topBarPartner} numberOfLines={1}>{activePartner.username}</Text>
            ) : null}
          </View>
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
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortMode(opt.key)}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {!activeConnectionId ? (
        <View style={styles.centerContent}>
          <Text style={styles.text}>
            Wybierz aktywnego znajomego w sekcji „Znajomi", żeby zobaczyć wspólnie polubione filmy.
          </Text>
        </View>
      ) : contentLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color="#E8E4D9" />
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
        <FlatList
          style={styles.matchList}
          data={visibleMatches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const rating = ratings[item.id];
            return (
              <View style={[styles.row, rating?.watched && styles.rowWatched]}>
                <TouchableOpacity style={styles.rowMain} onPress={() => setSelectedMatch(item)}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.poster} contentFit="cover" />
                  ) : (
                    <View style={[styles.poster, styles.posterPlaceholder]} />
                  )}
                  <Text style={styles.rowText} numberOfLines={2} ellipsizeMode="tail">
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Wyrównane od góry (nie na środku ekranu) — dla stanu "brak wyników filtra".
  topMessage: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  text: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 24 },

  // flex:1, żeby lista zajmowała dokładnie pozostałą przestrzeń pod stałym
  // paskiem filtrów i renderowała elementy od góry, nigdy nie centrując ich
  // w pionie, niezależnie od tego, ile filmów przejdzie przez filtr.
  matchList: { flex: 1 },

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
    backgroundColor: '#B5AFA0',
    marginHorizontal: 20,
    opacity: 0.5,
  },
  topBarPartnerBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  topBarPartner: { color: '#E8E4D9', fontSize: 17, fontWeight: 'bold', marginLeft: 10, flexShrink: 1 },
  changeFriendButton: {
    borderWidth: 1,
    borderColor: '#B5AFA0',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  changeFriendButtonText: { color: '#E8E4D9', fontSize: 12, fontWeight: 'bold' },

  // Jawna wysokość paska + pigułek (zamiast liczenia jej z paddingu) — daje
  // gwarantowaną, przewidywalną przestrzeń w pionie na literę bez przycinania,
  // niezależnie od metryk czcionki na danym urządzeniu. flexGrow/Shrink:0, żeby
  // ten pasek nigdy nie mógł zostać "rozciągnięty" i zepchnąć listę w dół.
  sortBar: { flexGrow: 0, flexShrink: 0, height: 52, marginTop: 10 },
  sortBarContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  sortChip: {
    height: 44,
    borderWidth: 1,
    borderColor: '#3A382F',
    borderRadius: 22,
    paddingHorizontal: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortChipActive: { backgroundColor: '#E8A33D', borderColor: '#E8A33D' },
  sortChipText: { color: '#B5AFA0', fontSize: 13, fontWeight: 'bold', lineHeight: 18, includeFontPadding: false },
  sortChipTextActive: { color: '#26251F' },

  listContent: { padding: 20, paddingTop: 10 },
  // Kafelek, plakat i checkbox powiększone o 20% względem oryginalnej wersji.
  row: {
    backgroundColor: '#1E1D18',
    borderRadius: 17,
    borderWidth: 0.25,
    borderColor: '#B5AFA0',
    padding: 12,
    marginBottom: 9.6,
  },
  rowWatched: { borderColor: '#4a7', borderWidth: 0.75 },
  rowMain: { flexDirection: 'row', alignItems: 'center' },
  poster: { width: 48, height: 70, borderRadius: 7, marginRight: 14 },
  posterPlaceholder: { backgroundColor: '#333' },
  // Tytuł o 50% większy niż poprzednio (15 -> 22.5) i bez limitu numberOfLines —
  // zawija się na tyle wierszy, ile potrzeba, żeby zmieścić się w kafelku.
  rowText: { color: '#E8E4D9', fontSize: 22.5, flex: 1, flexWrap: 'wrap' },

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
    borderColor: '#B5AFA0',
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
  scoreDotText: { color: '#B5AFA0', fontWeight: 'bold' },
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
    backgroundColor: '#1E1D18',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#E8A33D',
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  scoreMatchHeading: { color: '#E8A33D', fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  scoreMatchPoster: { width: 140, height: 210, borderRadius: 12, marginBottom: 14 },
  scoreMatchTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  scoreMatchSubtitle: { color: '#B5AFA0', fontSize: 14, textAlign: 'center', marginBottom: 18 },
  scoreMatchButton: { backgroundColor: '#E8A33D', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 30 },
  scoreMatchButtonText: { color: '#26251F', fontWeight: 'bold', fontSize: 15 },
});
