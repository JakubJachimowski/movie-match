export interface Genre {
  id: number;
  name: string;
}

export const GENRES: Genre[] = [
  { id: 28, name: 'akcja' },
  { id: 12, name: 'przygodowy' },
  { id: 35, name: 'komedia' },
  { id: 80, name: 'kryminał' },
  { id: 9648, name: 'mystery' },
  { id: 18, name: 'dramat' },
  { id: 14, name: 'fantasy' },
  { id: 27, name: 'horror' },
  { id: 10749, name: 'romans' },
  { id: 878, name: 'sci-fi' },
];

// Tła przycisków gatunków (tematyczne grafiki z wyciętym już napisem nazwy
// gatunku) — używane zamiast płaskiego tła w miejscach wyboru gatunku
// (siatka na ekranie głównym i na Twój profil). Statyczne require() —
// Metro wymaga literałów, stąd mapa po id zamiast dynamicznej ścieżki.
export const GENRE_BACKGROUNDS: Record<number, number> = {
  28: require('../assets/genres/genre_28.png'),
  12: require('../assets/genres/genre_12.png'),
  35: require('../assets/genres/genre_35.png'),
  80: require('../assets/genres/genre_80.png'),
  9648: require('../assets/genres/genre_9648.png'),
  18: require('../assets/genres/genre_18.png'),
  14: require('../assets/genres/genre_14.png'),
  27: require('../assets/genres/genre_27.png'),
  10749: require('../assets/genres/genre_10749.png'),
  878: require('../assets/genres/genre_878.png'),
};
