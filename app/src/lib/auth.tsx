import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

import { queryClient } from './query';
import { clearSignedUrls } from './signed-urls';
import { supabase } from './supabase';
import type { Profile } from './types';

type AuthContextValue = {
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  initializing: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<unknown>;
  signOut: (everywhere?: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => mounted && setInitializing(false));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        clearSignedUrls();
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['profile', 'me', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const signOut = useCallback(async (everywhere = false) => {
    await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId,
      email: session?.user.email ?? null,
      profile: profileQuery.data ?? null,
      initializing,
      profileLoading: !!userId && profileQuery.isLoading,
      refreshProfile: () => profileQuery.refetch(),
      signOut,
    }),
    [session, userId, profileQuery.data, profileQuery.isLoading, initializing, signOut, profileQuery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For screens inside the signed-in area, where a session always exists. */
export function useMe() {
  const auth = useAuth();
  return { ...auth, userId: auth.userId as string };
}
