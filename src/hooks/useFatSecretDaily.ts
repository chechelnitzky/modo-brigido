import { useCallback, useEffect, useState } from 'react';
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

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { data, error } = await supabase.functions.invoke('fatsecret-integration', {
        body: { action: 'daily', date }
      });
      if (error) throw error;
      setState({
        configured: data?.configured !== false,
        connected: Boolean(data?.connected),
        calories: data?.calories == null ? null : Number(data.calories),
        protein: data?.protein == null ? null : Number(data.protein),
        entriesCount: Number(data?.entriesCount ?? 0),
        loading: false,
        error: data?.error ? String(data.error) : ''
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudo leer FatSecret.'
      }));
    }
  }, [supabase, date]);

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

  return { ...state, refresh, connect, disconnect };
}
