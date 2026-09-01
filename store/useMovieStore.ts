import { create } from 'zustand';

export interface Movie {
  id: string;
  title: string;
  description: string;
  image: any;
}

const initialMovies: Movie[] = [
  { id: '1', title: 'test 1', description: 'Krótki opis pierwszego filmu.', image: require('../assets/photos/Wiktoria_test_1.jpg') },
  { id: '2', title: 'test 2', description: 'Krótki opis drugiego filmu.', image: require('../assets/photos/Wiktoria_test_2.jpg') },
  { id: '3', title: 'test 3', description: 'Krótki opis trzeciego filmu.', image: require('../assets/photos/Wiktoria_test_3.jpg') },
  { id: '4', title: 'test 4', description: 'Krótki opis czwartego filmu.', image: require('../assets/photos/Wiktoria_test_4.jpg') },
  { id: '5', title: 'test 5', description: 'Krótki opis piątego filmu.', image: require('../assets/photos/Wiktoria_test_5.jpg') },
];

interface HistoryEntry {
  movie: Movie;
  direction: 'left' | 'right';
}

interface MovieStore {
  queue: Movie[];
  liked: Movie[];
  disliked: Movie[];
  history: HistoryEntry[];
  swipeRight: (movie: Movie) => void;
  swipeLeft: (movie: Movie) => void;
  removeLiked: (movie: Movie) => void;
  removeDisliked: (movie: Movie) => void;
  undoLast: () => void;
}

export const useMovieStore = create<MovieStore>((set, get) => ({
  queue: initialMovies,
  liked: [],
  disliked: [],
  history: [],

  swipeRight: (movie) =>
    set((state) => ({
      queue: state.queue.filter((m) => m.id !== movie.id),
      liked: [...state.liked, movie],
      history: [...state.history, { movie, direction: 'right' }],
    })),

  swipeLeft: (movie) =>
    set((state) => ({
      queue: state.queue.filter((m) => m.id !== movie.id),
      disliked: [...state.disliked, movie],
      history: [...state.history, { movie, direction: 'left' }],
    })),

  removeLiked: (movie) =>
    set((state) => ({
      liked: state.liked.filter((m) => m.id !== movie.id),
      queue: [...state.queue, movie],
    })),

  removeDisliked: (movie) =>
    set((state) => ({
      disliked: state.disliked.filter((m) => m.id !== movie.id),
      queue: [...state.queue, movie],
    })),

  undoLast: () => {
    const { history } = get();
    if (history.length === 0) return;
    const last = history[history.length - 1];
    set((state) => ({
      history: state.history.slice(0, -1),
      liked: last.direction === 'right' ? state.liked.filter((m) => m.id !== last.movie.id) : state.liked,
      disliked: last.direction === 'left' ? state.disliked.filter((m) => m.id !== last.movie.id) : state.disliked,
      queue: [last.movie, ...state.queue],
    }));
  },
}));