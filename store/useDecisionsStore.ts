import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Movie } from './useMovieStore';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface DecisionsStore {
  fetchExcludedIds: (connectionId: string, userId: string) => Promise<Set<string>>;
  recordDecision: (
    connectionId: string,
    userId: string,
    movie: Movie,
    direction: 'left' | 'right'
  ) => Promise<void>;
  undoLastDecision: (connectionId: string, userId: string) => Promise<void>;
}

export const useDecisionsStore = create<DecisionsStore>()(() => ({
  fetchExcludedIds: async (connectionId, userId) => {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const [{ data: rightRows, error: rightError }, { data: leftRows, error: leftError }] = await Promise.all([
      supabase
        .from('decisions')
        .select('movie_id')
        .eq('connection_id', connectionId)
        .eq('user_id', userId)
        .eq('direction', 'right'),
      supabase
        .from('decisions')
        .select('movie_id')
        .eq('connection_id', connectionId)
        .eq('user_id', userId)
        .eq('direction', 'left')
        .gt('created_at', sevenDaysAgo),
    ]);

    if (rightError) throw rightError;
    if (leftError) throw leftError;

    const ids = new Set<string>();
    (rightRows ?? []).forEach((r) => ids.add(r.movie_id));
    (leftRows ?? []).forEach((r) => ids.add(r.movie_id));
    return ids;
  },

  // Zwykły insert (nie upsert) — celowo: ten sam film odrzucony ponownie po powrocie
  // do puli (po 7 dniach) ma dodać KOLEJNY wiersz, żeby w historii znajomego widniał
  // wielokrotnie (raz na każdą decyzję), a nie nadpisywać poprzedni wpis.
  recordDecision: async (connectionId, userId, movie, direction) => {
    const { error } = await supabase.from('decisions').insert({
      connection_id: connectionId,
      user_id: userId,
      movie_id: movie.id,
      title: movie.title,
      year: movie.year,
      image: movie.image,
      direction,
    });
    if (error) throw error;
  },

  undoLastDecision: async (connectionId, userId) => {
    const { data: lastRows, error: selectError } = await supabase
      .from('decisions')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (selectError) throw selectError;

    const lastId = lastRows?.[0]?.id;
    if (!lastId) return;

    const { error: deleteError } = await supabase.from('decisions').delete().eq('id', lastId);
    if (deleteError) throw deleteError;
  },
}));
