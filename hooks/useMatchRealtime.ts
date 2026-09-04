import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface MatchPayload {
  id: string;
  connection_id: string;
  movie_id: string;
  title: string;
  year: string | null;
  image: string | null;
  matched_at: string;
}

// Nasłuchuje w czasie rzeczywistym nowych wierszy w tabeli `matches` dla danego
// połączenia (wypełnianej przez trigger w bazie, gdy oboje użytkownicy przesuną
// ten sam film w prawo) — działa niezależnie od tego, które z dwojga użytkowników
// wykonało decydujące przesunięcie.
export function useMatchRealtime(connectionId: string | null, onNewMatch: (match: MatchPayload) => void) {
  const callbackRef = useRef(onNewMatch);
  callbackRef.current = onNewMatch;

  useEffect(() => {
    if (!connectionId) return;

    const channel = supabase
      .channel(`matches-${connectionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `connection_id=eq.${connectionId}` },
        (payload) => {
          callbackRef.current(payload.new as MatchPayload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [connectionId]);
}
