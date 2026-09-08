import { create } from 'zustand';

// Globalny stan powiększonego avatara. Dawniej AvatarZoom trzymał wszystko
// (stan + samą animację) lokalnie i renderował powiększoną wersję w <Modal>.
// Modal na Androidzie renderuje się jednak w OSOBNYM oknie systemowym —
// measureInWindow() wewnątrz modala i measureInWindow() na miniaturce (w
// głównym oknie ekranu) liczą współrzędne względem różnych punktów zerowych,
// więc różnica między nimi (dx/dy) była skażona stałym, nieprzewidywalnym
// przesunięciem. Stąd animacja kończyła się w innym miejscu niż faktyczny
// spoczynek miniaturki.
//
// Rozwiązanie: nie używać Modala w ogóle. Ten store trzyma tylko DANE
// ("co i skąd powiększyć"), a właściwy, animowany widok (AvatarZoomOverlay)
// jest montowany RAZ, na samej górze drzewa aplikacji (app/_layout.tsx) —
// czyli w TYM SAMYM oknie, co ekran z miniaturką. Dzięki temu oba pomiary
// (miniaturka i cel animacji) zawsze są w tym samym układzie współrzędnych.
export type Rect = { x: number; y: number; w: number; h: number };

interface OpenParams {
  ownerId: string;
  url: string | null | undefined;
  size: number;
  fallbackLetter?: string;
  anchor: Rect;
  // Pozwala AvatarZoomOverlay zmierzyć miniaturkę PONOWNIE, tuż przed
  // rozpoczęciem animacji zamykania — zamiast polegać wyłącznie na
  // wartości sprzed otwarcia (`anchor` powyżej), która może się już
  // zdezaktualizować (patrz komentarz przy wywołaniu w AvatarZoom.tsx).
  measureAnchor: () => Promise<Rect | null>;
}

interface AvatarZoomState {
  visible: boolean;
  ownerId: string | null;
  url: string | null | undefined;
  size: number;
  fallbackLetter?: string;
  anchor: Rect | null;
  measureAnchor: (() => Promise<Rect | null>) | null;
  open: (params: OpenParams) => void;
  close: () => void;
}

export const useAvatarZoomStore = create<AvatarZoomState>()((set) => ({
  visible: false,
  ownerId: null,
  url: null,
  size: 0,
  fallbackLetter: undefined,
  anchor: null,
  measureAnchor: null,

  open: ({ ownerId, url, size, fallbackLetter, anchor, measureAnchor }) =>
    set({ visible: true, ownerId, url, size, fallbackLetter, anchor, measureAnchor }),

  close: () => set({ visible: false }),
}));
