import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabase';

export type FatSecretDailyState = {
  configured: boolean;
  connected: boolean;
  calories: number | null;
  protein: number | null;
  entriesCount: number;
  loading: boolean;
  error: string;
};

const HISTORY_SYNC_DAYS = 30;

function currentDateInChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

const initialState: FatSecretDailyState = {
  configured: true,
  connected: false,
  calories: null,
  protein: null,
  entriesCount: 0,
  loading: true,
  error: ''
};

export function useFatSecretDaily(date: string) {
  const supabase = getSupabase();
  const [state, setState] = useState<FatSecretDailyState>(initialState);
  const historySyncStartedRef = useRef(false);

  const syncRecent = useCallback(async (force = false) => {
    if (historySyncStartedRef.current && !force) return;
    historySyncStartedRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
        body: {
          action: 'sync_recent',
          endDate: currentDateInChile(),
          days: HISTORY_SYNC_DAYS,
          force
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data;
    } catch (error) {
      historySyncStartedRef.current = false;
      throw error;
    }
  }, [supabase]);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
        body: { action: 'daily', date }
      });
      if (error) throw error;
      const connected = Boolean(data?.connected);
      setState({
        configured: data?.configured !== false,
        connected,
        calories: data?.calories == null ? null : Number(data.calories),
        protein: data?.protein == null ? null : Number(data.protein),
        entriesCount: Number(data?.entriesCount ?? 0),
        loading: false,
        error: data?.error ? String(data.error) : ''
      });
      if (connected && navigator.onLine && !historySyncStartedRef.current) {
        void syncRecent().catch(() => {
          // A later 5-minute refresh/focus can retry; today's diary remains usable.
        });
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudo leer FatSecret.'
      }));
    }
  }, [supabase, date, syncRecent]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const onFocus = () => void refresh(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
      body: { action: 'start' }
    });
    if (error) throw error;
    if (!data?.authorizeUrl) throw new Error(data?.error || 'No se pudo iniciar la conexión con FatSecret.');
    window.location.assign(String(data.authorizeUrl));
  }, [supabase]);

  const disconnect = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
      body: { action: 'disconnect' }
    });
    if (error) throw error;
    setState((current) => ({ ...current, connected: Boolean(data?.connected), calories: null, protein: null, entriesCount: 0 }));
  }, [supabase]);

  return { ...state, refresh, syncRecent, connect, disconnect };
}
