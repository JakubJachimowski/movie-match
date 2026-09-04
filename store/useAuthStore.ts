import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { setRememberMe } from '../lib/authStorage';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface AuthStore {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;

  signUp: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
  createProfile: (username: string, avatarUrl?: string | null) => Promise<void>;
  uploadAvatar: (localUri: string) => Promise<string>;
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  session: null,
  profile: null,
  initializing: true,

  signUp: async (email, password, rememberMe = true) => {
    setRememberMe(rememberMe);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  signIn: async (email, password, rememberMe = true) => {
    setRememberMe(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ profile: null });
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id;
    if (!userId) {
      set({ profile: null });
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    set({ profile: (data as Profile) ?? null });
  },

  createProfile: async (username, avatarUrl) => {
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Brak zalogowanego użytkownika.');
    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: userId, username, avatar_url: avatarUrl ?? null })
      .select()
      .single();
    if (error) throw error;
    set({ profile: data as Profile });
  },

  uploadAvatar: async (localUri) => {
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Brak zalogowanego użytkownika.');

    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();
    const extMatch = localUri.match(/\.(\w+)$/);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext}` });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  },
}));

// Nasłuchiwanie na zmiany sesji (start appki, logowanie, wylogowanie, odświeżenie tokenu).
// Dla zdarzeń, które mogą zmienić tożsamość użytkownika (start appki / logowanie),
// trzymamy "initializing" aż profil zostanie pobrany — inaczej na ułamek sekundy
// mignąłby ekran zakładania profilu, zanim wczyta się istniejący.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    useAuthStore.setState({ session });
    return;
  }

  if (event === 'SIGNED_OUT') {
    useAuthStore.setState({ session: null, profile: null, initializing: false });
    return;
  }

  useAuthStore.setState({ session, initializing: true });
  if (session) {
    try {
      await useAuthStore.getState().refreshProfile();
    } catch (e) {
      console.warn('refreshProfile error', e);
    }
  } else {
    useAuthStore.setState({ profile: null });
  }
  useAuthStore.setState({ initializing: false });
});
