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

interface Decision {
  movie: Movie;
  direction: 'left' | 'right';
  timestamp: number;
}

export interface GenreSettings {
  scoreMin: number;
  scoreMax: number;
  yearMin: number;
  yearMax: number;
  country: string;
}

const DEFAULT_SETTINGS: GenreSettings = {
  scoreMin: 6,
  scoreMax: 10,
  yearMin: 2000,
  yearMax: 2026,
  country: '',
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface MovieStore {
  decisions: Decision[];
  settings: Record<number, GenreSettings>;
  swipeRight: (movie: Movie) => void;
  swipeLeft: (movie: Movie) => void;
  undoLast: () => void;
  getExcludedIds: () => Set<string>;
  getLikedMovies: () => Movie[];
  getSettingsForGenre: (genreId: number) => GenreSettings;
  setSettingsForGenre: (genreId: number, settings: GenreSettings) => void;
}

export const useMovieStore = create<MovieStore>()(
  persist(
    (set, get) => ({
      decisions: [],
      settings: {},

      swipeRight: (movie) =>
        set((state) => ({
          decisions: [...state.decisions, { movie, direction: 'right', timestamp: Date.now() }],
        })),

      swipeLeft: (movie) =>
        set((state) => ({
          decisions: [...state.decisions, { movie, direction: 'left', timestamp: Date.now() }],
        })),

      undoLast: () =>
        set((state) => ({
          decisions: state.decisions.slice(0, -1),
        })),

      getExcludedIds: () => {
        const { decisions } = get();
        const now = Date.now();
        const ids = new Set<string>();
        decisions.forEach((d) => {
          if (d.direction === 'right') {
            ids.add(d.movie.id);
          } else if (now - d.timestamp < SEVEN_DAYS_MS) {
            ids.add(d.movie.id);
          }
        });
        return ids;
      },

      getLikedMovies: () => {
        const { decisions } = get();
        return decisions.filter((d) => d.direction === 'right').map((d) => d.movie);
      },

      getSettingsForGenre: (genreId) => {
        const { settings } = get();
        return settings[genreId] || DEFAULT_SETTINGS;
      },

      setSettingsForGenre: (genreId, newSettings) =>
        set((state) => ({
          settings: { ...state.settings, [genreId]: newSettings },
        })),
    }),
    {
      name: 'movie-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);