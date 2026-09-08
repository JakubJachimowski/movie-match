import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';

const ACTIVE_CONNECTION_KEY = 'movieMatch.activeConnectionId';

export interface Partner {
  connectionId: string;
  partnerId: string;
  username: string;
  avatarUrl: string | null;
  // Ulubione gatunki znajomego — używane m.in. do pokazania konturu gwiazdki
  // przy odpowiedniej kategorii na ekranie głównym (app/(tabs)/index.tsx).
  favoriteGenres: number[];
}

export interface PendingInvite {
  code: string;
  expiresAt: string;
}

interface ConnectionsStore {
  partners: Partner[];
  pendingInvite: PendingInvite | null;
  activeConnectionId: string | null;
  loading: boolean;

  fetchConnections: () => Promise<void>;
  createInvite: () => Promise<PendingInvite>;
  acceptInvite: (code: string) => Promise<void>;
  setActiveConnection: (connectionId: string) => void;
  removeConnection: (connectionId: string) => Promise<void>;
}

export const useConnectionsStore = create<ConnectionsStore>()((set, get) => ({
  partners: [],
  pendingInvite: null,
  activeConnectionId: null,
  loading: false,

  fetchConnections: async () => {
    const myId = useAuthStore.getState().session?.user.id;
    if (!myId) return;

    set({ loading: true });
    try {
      const { data: rows, error } = await supabase
        .from('connections')
        .select('id, user_a, user_b, status, invite_code, expires_at')
        .or(`user_a.eq.${myId},user_b.eq.${myId}`);
      if (error) throw error;

      const accepted = (rows ?? []).filter((r) => r.status === 'accepted');
      const myPending = (rows ?? []).find((r) => r.status === 'pending' && r.user_a === myId);

      const partnerIds = accepted.map((r) => (r.user_a === myId ? r.user_b : r.user_a)).filter(Boolean) as string[];

      let profilesById: Record<string, { username: string; avatar_url: string | null; favorite_genres: number[] | null }> = {};
      if (partnerIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, favorite_genres')
          .in('id', partnerIds);
        if (profilesError) throw profilesError;
        profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      }

      const partners: Partner[] = accepted.map((r) => {
        const partnerId = (r.user_a === myId ? r.user_b : r.user_a) as string;
        const profile = profilesById[partnerId];
        return {
          connectionId: r.id,
          partnerId,
          username: profile?.username ?? '(nieznany)',
          avatarUrl: profile?.avatar_url ?? null,
          favoriteGenres: profile?.favorite_genres ?? [],
        };
      });

      // Zapamiętany wybór aktywnego znajomego przetrwa restart appki — jeśli w
      // stanie nic jeszcze nie ma, sięgamy po to, co zostało zapisane na dysku.
      let currentActive = get().activeConnectionId;
      if (!currentActive) {
        try {
          currentActive = await AsyncStorage.getItem(ACTIVE_CONNECTION_KEY);
        } catch {
          currentActive = null;
        }
      }
      const activeStillValid = currentActive && partners.some((p) => p.connectionId === currentActive);
      // Gdy zapamiętany znajomy nie występuje w TYM konkretnym wyniku zapytania,
      // a lista partnerów przyszła PUSTA (0 wyników) — to zwykle chwilowy problem
      // sieci/timing przy odświeżaniu sesji, a nie realny brak znajomych. W takim
      // wypadku NIE nadpisujemy zapamiętanego wyboru pierwszym z brzegu (i tak
      // pustym) wynikiem — zostawiamy poprzednią wartość, żeby kolejny, udany
      // fetch mógł ją poprawnie zwalidować. To właśnie ten przypadek dawał
      // wrażenie, że apka "czasem" wybiera pierwszego sparowanego zamiast
      // ostatnio używanego: fałszywie pusty odczyt trwale kasował zapamiętany wybór.
      const nextActive = activeStillValid
        ? currentActive
        : partners.length > 0
          ? (partners[0]?.connectionId ?? null)
          : (currentActive ?? null);

      set({
        partners,
        pendingInvite:
          myPending && myPending.invite_code && myPending.expires_at
            ? { code: myPending.invite_code, expiresAt: myPending.expires_at }
            : null,
        activeConnectionId: nextActive,
      });

      if (nextActive) {
        AsyncStorage.setItem(ACTIVE_CONNECTION_KEY, nextActive).catch(() => {});
      } else if (partners.length > 0) {
        // Kasujemy zapis tylko wtedy, gdy naprawdę wiemy (niepusta lista), że
        // zapamiętany znajomy już nie istnieje — nigdy przy pustym/niepewnym wyniku.
        AsyncStorage.removeItem(ACTIVE_CONNECTION_KEY).catch(() => {});
      }
    } finally {
      set({ loading: false });
    }
  },

  createInvite: async () => {
    const { data, error } = await supabase.rpc('create_invite');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const invite: PendingInvite = { code: row.invite_code, expiresAt: row.expires_at };
    set({ pendingInvite: invite });
    return invite;
  },

  acceptInvite: async (code: string) => {
    const { error } = await supabase.rpc('accept_invite', { p_code: code.trim().toUpperCase() });
    if (error) throw error;
    await get().fetchConnections();
  },

  setActiveConnection: (connectionId: string) => {
    set({ activeConnectionId: connectionId });
    AsyncStorage.setItem(ACTIVE_CONNECTION_KEY, connectionId).catch(() => {});
  },

  removeConnection: async (connectionId: string) => {
    const { error } = await supabase.from('connections').delete().eq('id', connectionId);
    if (error) throw error;

    const wasActive = get().activeConnectionId === connectionId;
    set((state) => ({
      partners: state.partners.filter((p) => p.connectionId !== connectionId),
      activeConnectionId: wasActive ? null : state.activeConnectionId,
    }));

    if (wasActive) {
      AsyncStorage.removeItem(ACTIVE_CONNECTION_KEY).catch(() => {});
      const fallback = get().partners[0]?.connectionId;
      if (fallback) {
        get().setActiveConnection(fallback);
      }
    }
  },
}));
