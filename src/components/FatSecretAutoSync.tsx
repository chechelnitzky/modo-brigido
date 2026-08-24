import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { PACER_SYNC_EVENT } from '../lib/pacer';
import { getSupabase } from '../lib/supabase';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function FatSecretAutoSync() {
  const supabase = getSupabase();
  const { user } = useAuth();
  const { selectedDate } = useSelectedDate();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const sync = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
          body: { action: 'daily', date: selectedDate }
        });
        if (error || !data?.connected || data?.calories == null) return;
        // TodayPage already refreshes daily_logs when this event fires. FatSecret's
        // Edge Function has just updated the short-lived daily nutrition cache.
        window.dispatchEvent(new CustomEvent(PACER_SYNC_EVENT, { detail: { activities: [] } }));
      } catch {
        // FatSecret is optional: a sync failure must never block the rest of the app.
      }
    };

    void sync();
    const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
    const onFocus = () => void sync();
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [supabase, user, selectedDate]);

  return null;
}
