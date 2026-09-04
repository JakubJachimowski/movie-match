import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { fetchMoviesByGenre } from '../services/tmdb';
import { useDecisionsStore } from '../store/useDecisionsStore';
import { GenreSettings, Movie } from '../store/useMovieStore';

const MIN_BUFFER = 5;
const MAX_FETCH_ATTEMPTS = 5;

function prefetchPosters(movies: Movie[]) {
  movies.forEach((m) => {
    Image.prefetch(m.image).catch(() => {});
  });
}

interface UseMovieDeckArgs {
  genreId: number;
  connectionId: string | null;
  userId: string | null;
  settings: GenreSettings;
}

export function useMovieDeck({ genreId, connectionId, userId, settings }: UseMovieDeckArgs) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMovies = async (activeSettings: GenreSettings) => {
    if (!connectionId || !userId) return;
    setLoading(true);
    const excluded = await useDecisionsStore.getState().fetchExcludedIds(connectionId, userId);
    let collected: Movie[] = [];
    let currentPage = 1;
    let pages = 1;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      const { movies: fetched, totalPages: fetchedTotalPages } = await fetchMoviesByGenre(
        genreId,
        currentPage,
        activeSettings
      );
      pages = fetchedTotalPages;
      collected = [...collected, ...fetched.filter((m) => !excluded.has(m.id))];
      if (collected.length >= MIN_BUFFER || currentPage >= pages) break;
      currentPage += 1;
    }

    setMovies(collected);
    prefetchPosters(collected);
    setTotalPages(pages);
    setPage(currentPage);
    setCurrentIndex(0);
    setLoading(false);
  };

  useEffect(() => {
    if (!genreId || !connectionId || !userId) return;
    loadMovies(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreId, connectionId, userId]);

  useEffect(() => {
    if (!genreId || !connectionId || !userId || loading || fetchingMore) return;
    const remaining = movies.length - currentIndex;
    if (remaining >= MIN_BUFFER || page >= totalPages) return;

    let cancelled = false;
    setFetchingMore(true);

    (async () => {
      const excluded = await useDecisionsStore.getState().fetchExcludedIds(connectionId, userId);
      let collected: Movie[] = [];
      let currentPage = page;

      for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS && currentPage < totalPages; attempt++) {
        currentPage += 1;
        const { movies: fetched } = await fetchMoviesByGenre(genreId, currentPage, settings);
        collected = [...collected, ...fetched.filter((m) => !excluded.has(m.id))];
        if (collected.length >= MIN_BUFFER) break;
      }

      if (!cancelled) {
        prefetchPosters(collected);
        setMovies((prev) => [...prev, ...collected]);
        setPage(currentPage);
        setFetchingMore(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, movies.length, totalPages, loading, connectionId, userId]);

  const currentMovie = movies[currentIndex];
  const noMoviesAvailable = !loading && (movies.length === 0 || (currentIndex >= movies.length && page >= totalPages));

  const advance = () => setCurrentIndex((i) => i + 1);
  const goBack = () => setCurrentIndex((i) => Math.max(0, i - 1));

  return {
    movies,
    currentIndex,
    currentMovie,
    loading,
    noMoviesAvailable,
    advance,
    goBack,
    /** Przeładowuje talię od zera z podanymi (np. właśnie zmienionymi) ustawieniami filtrów. */
    reload: (newSettings: GenreSettings) => loadMovies(newSettings),
  };
}
