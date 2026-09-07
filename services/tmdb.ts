import { Movie } from '../store/useMovieStore';

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export interface MovieFilters {
  scoreMin: number;
  scoreMax: number;
  yearMin: number;
  yearMax: number;
  countries: string[];
  providers: number[];
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
  // "|" = OR w składni TMDB discover — dowolny z wybranych krajów/platform pasuje.
  if (filters.countries.length > 0) {
    params.set('with_origin_country', filters.countries.join('|'));
  }
  if (filters.providers.length > 0) {
    params.set('with_watch_providers', filters.providers.join('|'));
    params.set('watch_region', 'PL');
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
      country: (m.origin_country && m.origin_country[0]) || m.original_language?.toUpperCase() || '—',
      voteAverage: typeof m.vote_average === 'number' ? m.vote_average : 0,
    }));

  return { movies, totalPages: data.total_pages || 1 };
}

// Czas trwania nie jest dostępny w liście filmów — pobierany osobno, na żądanie.
export async function fetchMovieRuntime(movieId: string): Promise<number | null> {
  const params = new URLSearchParams();
  params.set('api_key', API_KEY || '');
  params.set('language', 'pl-PL');

  const response = await fetch(`${BASE_URL}/movie/${movieId}?${params.toString()}`);
  const data = await response.json();
  return typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : null;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string;
}

const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

// Zwraca skróconą listę serwisów VOD (subskrypcja) dostępnych w Polsce dla danego
// filmu — wraz z logo dostawcy (do wyświetlenia zamiast samej nazwy tekstowej).
export async function fetchWatchProviders(movieId: string): Promise<WatchProvider[]> {
  const params = new URLSearchParams();
  params.set('api_key', API_KEY || '');

  const response = await fetch(`${BASE_URL}/movie/${movieId}/watch/providers?${params.toString()}`);
  const data = await response.json();

  const plProviders = data.results?.PL?.flatrate || [];
  return plProviders.slice(0, 4).map((p: any) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoUrl: p.logo_path ? `${LOGO_BASE}${p.logo_path}` : '',
  }));
}

export interface MovieSearchResult {
  id: string;
  title: string;
  year: string | null;
  image: string | null;
}

// Wyszukiwanie filmów po tytule — używane przy wybieraniu "ulubionych filmów"
// w profilu (użytkownik szuka i wybiera z wyników TMDB).
export async function searchMovies(query: string): Promise<MovieSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const params = new URLSearchParams();
  params.set('api_key', API_KEY || '');
  params.set('language', 'pl-PL');
  params.set('query', trimmed);
  params.set('include_adult', 'false');

  const response = await fetch(`${BASE_URL}/search/movie?${params.toString()}`);
  const data = await response.json();

  return (data.results || []).slice(0, 20).map((m: any) => ({
    id: String(m.id),
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    image: m.poster_path ? `${IMAGE_BASE}${m.poster_path}` : null,
  }));
}

export interface MovieFullDetails extends Movie {
  runtime: number | null;
  providers: WatchProvider[];
}

// Pełne dane filmu na żądanie (np. po kliknięciu w pozycję na liście "wspólnie
// polubione") — jedno zapytanie łączące szczegóły, czas trwania i dostawców VOD.
export async function fetchMovieFullDetails(movieId: string): Promise<MovieFullDetails | null> {
  const params = new URLSearchParams();
  params.set('api_key', API_KEY || '');
  params.set('language', 'pl-PL');
  params.set('append_to_response', 'watch/providers');

  const response = await fetch(`${BASE_URL}/movie/${movieId}?${params.toString()}`);
  const data = await response.json();
  if (!data || data.success === false) return null;

  const plProviders = data['watch/providers']?.results?.PL?.flatrate || [];

  return {
    id: String(data.id),
    title: data.title,
    description: data.overview || 'Brak opisu.',
    image: data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : '',
    year: data.release_date ? data.release_date.slice(0, 4) : '—',
    country: (data.origin_country && data.origin_country[0]) || data.original_language?.toUpperCase() || '—',
    voteAverage: typeof data.vote_average === 'number' ? data.vote_average : 0,
    runtime: typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : null,
    providers: plProviders.slice(0, 4).map((p: any) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoUrl: p.logo_path ? `${LOGO_BASE}${p.logo_path}` : '',
    })),
  };
}