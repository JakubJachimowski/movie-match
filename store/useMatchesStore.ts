import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface MatchRow {
  id: string;
  movie_id: string;
  title: string;
  year: string | null;
  image: string | null;
  matched_at: string;
}

export interface MatchRating {
  watched: boolean;
  userScore: number | null;
}

interface MatchesState {
  connectionId: string | null;
  matches: MatchRow[];
  ratings: Record<string, MatchRating>;
  friendScores: Record<string, number | null>;
  // ready=true tylko wtedy, gdy WSZYSTKIE dane (dopasowania + oceny, obie
  // strony) dla `connectionId` są już w komplecie — dzięki temu ekran
  // matched.tsx (i przycisk "Match!'ed" prowadzący do niego) mogą pokazać
  // kafelki dopiero w 100% gotowe, zamiast wczytywać je PO wejściu na ekran.
  ready: boolean;
  loading: boolean;
  inFlightConnectionId: string | null;
  /** Pobiera (lub, jeśli już aktualne, pomija) dane dla danego znajomego. */
  prefetch: (connectionId: string, myId: string) => Promise<void>;
  setRating: (matchId: string, myId: string, next: MatchRating) => Promise<void>;
  setFriendScore: (matchId: string, score: number | null) => void;
  removeMatch: (matchId: string) => Promise<void>;
}

export const useMatchesStore = create<MatchesState>((set, get) => ({
  connectionId: null,
  matches: [],
  ratings: {},
  friendScores: {},
  ready: false,
  loading: false,
  inFlightConnectionId: null,

  prefetch: async (connectionId, myId) => {
    if (!connectionId || !myId) return;
    const state = get();
    // Już gotowe dla tego znajomego — nic do roboty.
    if (state.connectionId === connectionId && state.ready) return;
    // Pobieranie dla tego znajomego już trwa (np. wywołane jednocześnie z
    // przycisku "Match!'ed" i z samego ekranu matched.tsx) — nie dubluj zapytań.
    if (state.inFlightConnectionId === connectionId) return;

    set({ inFlightConnectionId: connectionId, loading: true, ready: false });

    const { data: matchesData, error: matchesError } = await supabase
      .from('matches')
      .select('id, movie_id, title, year, image, matched_at')
      .eq('connection_id', connectionId)
      .order('matched_at', { ascending: false });

    if (matchesError) {
      console.warn('fetch matches error', matchesError);
      set({ loading: false, inFlightConnectionId: null });
      return;
    }

    const matches = matchesData ?? [];
    const ids = matches.map((m) => m.id);
    const ratings: Record<string, MatchRating> = {};
    const friendScores: Record<string, number | null> = {};

    if (ids.length > 0) {
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('match_ratings')
        .select('match_id, user_id, watched, user_score')
        .in('match_id', ids);

      if (ratingsError) {
        console.warn('fetch match_ratings error', ratingsError);
      } else {
        (ratingsData ?? []).forEach((r) => {
          if (r.user_id === myId) {
            ratings[r.match_id] = { watched: r.watched, userScore: r.user_score };
          } else {
            friendScores[r.match_id] = r.user_score;
          }
        });
      }
    }

    set({
      connectionId,
      matches,
      ratings,
      friendScores,
      ready: true,
      loading: false,
      inFlightConnectionId: null,
    });
  },

  setRating: async (matchId, myId, next) => {
    set((state) => ({ ratings: { ...state.ratings, [matchId]: next } }));
    const { error } = await supabase
      .from('match_ratings')
      .upsert(
        { match_id: matchId, user_id: myId, watched: next.watched, user_score: next.userScore },
        { onConflict: 'match_id,user_id' }
      );
    if (error) console.warn('upsert match_ratings error', error);
  },

  setFriendScore: (matchId, score) => {
    set((state) => ({ friendScores: { ...state.friendScores, [matchId]: score } }));
  },

  removeMatch: async (matchId) => {
    const { error } = await supabase.from('matches').delete().eq('id', matchId);
    if (error) {
      console.warn('delete match error', error);
      throw error;
    }
    set((state) => ({ matches: state.matches.filter((m) => m.id !== matchId) }));
  },
}));
