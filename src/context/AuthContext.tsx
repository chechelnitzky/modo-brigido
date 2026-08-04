import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { cacheKeys, cacheProfile, getCached, syncPendingMutations } from '../lib/offline';
import type { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const currentSession = (await supabase.auth.getSession()).data.session;
    const currentUser = currentSession?.user;
    if (!currentUser) {
      setProfile(null);
      return;
    }

    const cached = await getCached<Profile>(cacheKeys.profile(currentUser.id));
    if (cached) setProfile(cached);
    if (!navigator.onLine) {
      if (!cached) throw new Error('Abre la app con internet una vez para guardar tu perfil en este dispositivo.');
      return;
    }

    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error) {
      if (!cached) throw error;
      return;
    }
    const next = data as Profile;
    setProfile(next);
    await cacheProfile(next);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        try {
          await refreshProfile();
          if (navigator.onLine) void syncPendingMutations();
        } catch (error) {
          console.error(error);
        }
      }
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        try {
          await refreshProfile();
          if (navigator.onLine) void syncPendingMutations();
        } catch (error) {
          console.error(error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    refreshProfile,
    signOut: async () => {
      await supabase.auth.signOut();
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
