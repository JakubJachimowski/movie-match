import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface FriendRatingPayload {
  match_id: string;
  user_score: number | null;
}

// Nasłuchuje w czasie rzeczywistym zmian oceny znajomego w tabeli match_ratings
// (filtr po jego user_id — prostszy i lepiej wspierany przez Realtime niż "IN"
// po liście match_id) — dzięki temu podzielone kropki ocen i powiadomienie o
// zgodności ocen aktualizują się na żywo, bez ręcznego odświeżania ekranu.
export function useFriendRatingRealtime(friendId: string | null, onChange: (payload: FriendRatingPayload) => void) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    if (!friendId) return;

    const channel = supabase
      .channel(`friend-ratings-${friendId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_ratings', filter: `user_id=eq.${friendId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { match_id: string; user_score: number | null } | null;
          if (row) callbackRef.current({ match_id: row.match_id, user_score: row.user_score ?? null });
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
          console.warn(`useFriendRatingRealtime: subskrypcja dla ${friendId} — status=${status}`, err);
        } else if (__DEV__) {
          console.log(`useFriendRatingRealtime: subskrypcja dla ${friendId} — status=${status}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [friendId]);
}
