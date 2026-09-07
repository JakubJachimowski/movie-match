import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Movie {
  id: string;
  title: string;
  description: string;
  image: string;
  year: string;
  country: string;
  voteAverage: number;
}

export interface GenreSettings {
  scoreMin: number;
  scoreMax: number;
  yearMin: number;
  yearMax: number;
  // Kraj pochodzenia — wielokrotny wybór (pusta lista = dowolny kraj).
  countries: string[];
  // Platformy VOD (identyfikatory dostawców TMDB) — wielokrotny wybór (pusta lista = dowolna).
  providers: number[];
}

const DEFAULT_SETTINGS: GenreSettings = {
  scoreMin: 6,
  scoreMax: 10,
  yearMin: 2000,
  yearMax: 2026,
  countries: [],
  providers: [],
};

// Filtry gatunków (ocena/rok/kraj) zostają lokalne na urządzeniu — to preferencje
// przeglądania, nie dane wspólne ze znajomym. Same decyzje (swipe'y) i dopasowania
// są od teraz w Supabase — patrz store/useDecisionsStore.ts.
interface MovieStore {
  settings: Record<number, GenreSettings>;
  getSettingsForGenre: (genreId: number) => GenreSettings;
  setSettingsForGenre: (genreId: number, settings: GenreSettings) => void;
  // Ostatnio wybrany gatunek na ekranie głównym — przetrwa restart appki, żeby
  // po ponownym otwarciu nie trzeba było wybierać go od nowa za każdym razem.
  lastGenreId: number | null;
  setLastGenreId: (genreId: number) => void;
}

export const useMovieStore = create<MovieStore>()(
  persist(
    (set, get) => ({
      settings: {},
      lastGenreId: null,

      getSettingsForGenre: (genreId) => {
        const { settings } = get();
        // Spread na wypadek starszych zapisanych ustawień sprzed dodania
        // pól countries/providers (wielokrotny wybór) — uzupełnia braki.
        return { ...DEFAULT_SETTINGS, ...(settings[genreId] || {}) };
      },

      setSettingsForGenre: (genreId, newSettings) =>
        set((state) => ({
          settings: { ...state.settings, [genreId]: newSettings },
        })),

      setLastGenreId: (genreId) => set({ lastGenreId: genreId }),
    }),
    {
      name: 'movie-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
