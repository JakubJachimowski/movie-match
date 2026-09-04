import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';

export interface Partner {
  connectionId: string;
  partnerId: string;
  username: string;
  avatarUrl: string | null;
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

      let profilesById: Record<string, { username: string; avatar_url: string | null }> = {};
      if (partnerIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
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
        };
      });

      const currentActive = get().activeConnectionId;
      const activeStillValid = currentActive && partners.some((p) => p.connectionId === currentActive);

      set({
        partners,
        pendingInvite:
          myPending && myPending.invite_code && myPending.expires_at
            ? { code: myPending.invite_code, expiresAt: myPending.expires_at }
            : null,
        activeConnectionId: activeStillValid ? currentActive : partners[0]?.connectionId ?? null,
      });
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

  setActiveConnection: (connectionId: string) => set({ activeConnectionId: connectionId }),
}));
