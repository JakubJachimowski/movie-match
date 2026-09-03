import { Movie } from '../store/useMovieStore';

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export interface MovieFilters {
  scoreMin: number;
  scoreMax: number;
  yearMin: number;
  yearMax: number;
  country: string;
}

export async function fetchMoviesByGenre(
  genreId: number,
  page: number,
  filters: MovieFilters
): Promise<{ movies: Movie[]; totalPages: number }> {
  const params = new URLSearchParams();
  params.set('api_key', API_KEY || '');
  params.set('language', 'pl-PL');
  params.set('sort_by', 'popularity.desc');
  params.set('with_genres', String(genreId));
  params.set('vote_average.gte', String(filters.scoreMin));
  params.set('vote_average.lte', String(filters.scoreMax));
  params.set('primary_release_date.gte', `${filters.yearMin}-01-01`);
  params.set('primary_release_date.lte', `${filters.yearMax}-12-31`);
  params.set('vote_count.gte', '100');
  params.set('page', String(page));
  if (filters.country) {
    params.set('with_origin_country', filters.country);
  }

  const response = await fetch(`${BASE_URL}/discover/movie?${params.toString()}`);
  const data = await response.json();

  const movies: Movie[] = (data.results || [])
    .filter((m: any) => m.poster_path)
    .map((m: any) => ({
      id: String(m.id),
      title: m.title,
      description: m.overview || 'Brak opisu.',
      image: `${IMAGE_BASE}${m.poster_path}`,
      year: m.release_date ? m.release_date.slice(0, 4) : '—',
    }));

  return { movies, totalPages: data.total_pages || 1 };
}