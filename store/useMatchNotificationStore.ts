import { create } from 'zustand';

// Śledzi, dla których połączeń pojawił się nowy match, którego użytkownik
// jeszcze nie "obejrzał" (nie wszedł w listę wspólnie polubionych) — to steruje
// pomarańczowym podświetleniem przycisku Match! na ekranie swipowania.
interface MatchNotificationStore {
  unseenByConnection: Record<string, boolean>;
  markUnseen: (connectionId: string) => void;
  markSeen: (connectionId: string) => void;
  hasUnseen: (connectionId: string | null) => boolean;
}

export const useMatchNotificationStore = create<MatchNotificationStore>()((set, get) => ({
  unseenByConnection: {},

  markUnseen: (connectionId) =>
    set((s) => ({ unseenByConnection: { ...s.unseenByConnection, [connectionId]: true } })),

  markSeen: (connectionId) =>
    set((s) => ({ unseenByConnection: { ...s.unseenByConnection, [connectionId]: false } })),

  hasUnseen: (connectionId) => (connectionId ? !!get().unseenByConnection[connectionId] : false),
}));
